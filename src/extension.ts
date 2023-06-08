import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  global_keys,
  MEDIA_DIR,
  PLUGIN_CN_NAME,
  PLUGIN_NAME,
  command_ids,
  config_ids,
  config_default,
} from "./global";
import { randomInt } from "crypto";
import {
  dirRead,
  ensure,
  fileCopy,
  fileExisted,
  fileRemove,
  fileRename,
  getDirPath,
  getDisplayFilename,
  getFilename,
  getNonce,
  initDir,
  replaceAll,
  shuffleArray,
} from "./utils";
import { error } from "console";
import { CommonPickItem, MultiStepInput } from "./multistepHelper";
import { config } from "process";

let workbenchPath: string | undefined;

const mainCSSName: string = "workbench.desktop.main.css";
const mainCSSOriName: string = "ori_workbench.desktop.main.css";
const switchTip: string = "@keyframes switch";

let mainCSSPath: string;
let mainCSSBakPath: string;
let mainCSSOriPath: string;
let mainCSSRemovedPath: string;

let loaderDir: string;
let userDir: string;
let innerDir: string;

let extensionUri: vscode.Uri;

let updateConfigTimer: NodeJS.Timeout | undefined;

let context: vscode.ExtensionContext;

let oriExisted: boolean;

// 用来控制回调是否生效
// let loaderMainPromise: Promise<boolean> | undefined

// 不要置为全局，因为用户会更改,即拿即用
// let configObj: vscode.WorkspaceConfiguration
// 这里是为了拿到用户更改前的configObj，只针对几个判定配置
let lastConfigObj: vscode.WorkspaceConfiguration;

// 只有reloadWindow之后才会改
let curMainRecord: MainEntity | null = null;

// 禁用状态下只能做一个操作：启用

export async function activate(_context: vscode.ExtensionContext) {

  console.log("activate...");

  // 启动配置
  if (!workbenchPath) {
    const appRoot = vscode.env.appRoot;
    workbenchPath = path.join(appRoot, "out", "vs", "workbench");
  }
  makePath(workbenchPath);
  // 如果这个文件不存在，表示当前插件已经没有用了，直接报错即可
  try {
    ensure(await fileExisted(mainCSSPath));
  } catch (err) {
    vscode.window.showErrorMessage(
      `很抱歉，对于当前版本vscode，${PLUGIN_CN_NAME}不起作用！`
    );
    return;
  }

  context = _context;
  extensionUri = context.extensionUri;
  lastConfigObj = vscode.workspace.getConfiguration();

  // context.globalState.update(global_keys.IS_INNER, undefined);
  // context.globalState.update(global_keys.BG_NAME, undefined);

  ensure(await initDir(innerDir));
  ensure(await initDir(userDir));

  // 禁用情况下的注册
  context.subscriptions.push(
    vscode.commands.registerCommand(command_ids.DISABLE_EXT, async () => {
      const configObj = vscode.workspace.getConfiguration();
      if (configObj.get<boolean>(config_ids.ENABLED)) {
        vscode.window
          .showInformationMessage("确定禁用壁纸加载器吗？", "确定", "取消")
          .then(async (res) => {
            if (res === "确定") {
              await onDisable();
              reloadWindow();
            }
          });
      }
    }),
    vscode.commands.registerCommand(command_ids.ENABLE_EXT, async () => {
      const configObj = vscode.workspace.getConfiguration();
      configObj
        .update(config_ids.ENABLED, true, vscode.ConfigurationTarget.Global)
        .then(() => {
          loaderMain();
        });
    }),
    vscode.commands.registerCommand(command_ids.OPEN_USER_DIR, () => {
      checkEnabledAndTip();
      vscode.env.openExternal(vscode.Uri.file(userDir));
    }),
    vscode.commands.registerCommand(command_ids.Config_BG_LOADER, () => {
      configBGLoader();
    }),
    vscode.commands.registerCommand(command_ids.REFRESH_BG, async () => {
      // 禁用下不可用
      if (!extEnabled()) {
        vscode.window
          .showInformationMessage(
            "此操作只有在插件启用后才能执行，是否现在启用插件？",
            "确定",
            "取消"
          )
          .then((res) => {
            if (res === "确定") {
              vscode.commands.executeCommand(command_ids.ENABLE_EXT);
            }
          });
        return;
      }

      if (isSwitchModel()) {
        vscode.window.showInformationMessage(
          `当前壁纸每${vscode.workspace
            .getConfiguration()
            .get(config_ids.ZOOM_CIRCLE)}秒就会切换一次哦！`
        );
        return;
      }

      // 重新读取配置
      const configObj = vscode.workspace.getConfiguration();

      // 按道理，应该在loaderMain结束之后再执行，可能会有问题
      if (configObj.get<boolean>(config_ids.AUTO_REFRESH, true)) {
        reloadWindow();
      } else {
        const curMainRecord = await readCur();
        await refreshMain(curMainRecord, configObj);
        reloadWindow();
      }
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("style")) {
        // 如果插件是禁用状态，什么都不管
        if (!extEnabled()) return;

        // 修改两次，防止style和用户配置不同步的情况
        context.globalState.update(global_keys.STYLE_UPDATE, true);

        clearTimeout(updateConfigTimer);
        updateConfigTimer = setTimeout(async () => {
          console.log("修改style配置");
          // 重新读取配置
          const configObj = vscode.workspace.getConfiguration();
          // const curMainRecord = await readCur()
          // const success = await refreshMain(curMainRecord, configObj)
          // let success = true;
          // if (configObj.get<boolean>(config_ids.AUTO_REFRESH)) {
          //   // 修改配置就是为了看当前的，所以recover
          //   success = await recover();
          // } else {
          //   const curMainObj = await readCur();
          //   if (curMainObj) {
          //     success = await writeMain(curMainObj,configObj);
          //   }
          // }

          await recover();
          const curMainObj = await readCur();
          if (curMainObj) {
            const success = await writeMain(curMainObj, configObj);
            if (success) {
              showInfoBeforeReload("修改后需要重启vscode,现在重启吗?");
            }
          }
        }, 100);
      } else if (event.affectsConfiguration(config_ids.AUTO_REFRESH)) {
        if (!extEnabled()) return;
        if (getConfig<boolean>(config_ids.AUTO_REFRESH)) {
          // 开启自动刷新
          // 更改一次
          const curMainRecord = await readCur();
          await refreshMain(curMainRecord, configObj);
          // 不直接刷新
          // reloadWindow()
        } else {
          // 关闭自动刷新，就写回来
          await recover();
        }
      } else if (event.affectsConfiguration(config_ids.ENABLED)) {
        if (getConfig<boolean>(config_ids.ENABLED)) {
          vscode.commands.executeCommand(command_ids.ENABLE_EXT);
        } else {
          vscode.commands.executeCommand(command_ids.DISABLE_EXT);
        }
      }
    })
  );
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  statusBarItem.text = `$(octoface) ${PLUGIN_CN_NAME}`;
  statusBarItem.command = command_ids.Config_BG_LOADER;
  statusBarItem.show();

  oriExisted = await fileExisted(mainCSSOriPath);
  const configObj = vscode.workspace.getConfiguration();
  if (!configObj.get<boolean>(config_ids.ENABLED)) {
    console.log("被禁用了");
    // 定义一个概念，从插件下载了那一刻开始，我们就完成了从禁用到启动，默认是启动，所以要完成禁用->启动

    // if (oriExisted) {
    // 	// 被禁用下居然还存在，这是不对的，直接禁用
    // 	onDisable()
    // }
    return;
  }

  await loaderMain();

  // 非禁用情况下的注册
  // context.subscriptions.push(
  // vscode.commands.registerCommand(command_ids.FIX_BG, async () => {
  //   // 固定当前的壁纸
  //   const mainObj = await readCur();
  //   if (!mainObj) {
  //     console.error("fix fail");
  //     return;
  //   }
  //   configObj
  //     .update(
  //       config_ids.AUTO_REFRESH,
  //       false,
  //       vscode.ConfigurationTarget.Global
  //     )
  //     .then(() => {
  //       console.log("将auto-refresh设置为false");
  //     });

  //   await writeMain(mainObj, configObj);
  //   console.log("fix success");
  // }),
  // vscode.commands.registerCommand(command_ids.AUTO_REFRESH_BG, async () => {
  //   // 这两个顺序不能交换
  //   vscode.commands.executeCommand(command_ids.REFRESH_BG);
  //   configObj
  //     .update(
  //       config_ids.AUTO_REFRESH,
  //       true,
  //       vscode.ConfigurationTarget.Global
  //     )
  //     .then(() => {
  //       console.log("将auto-refresh设置为true");
  //     });
  // })
  // );
  console.log("完成");
}

async function loaderMain() {
  // 查找vscode的位置
  // 先读配置
  const configObj = vscode.workspace.getConfiguration();

  const existedRemoved = await fileExisted(mainCSSRemovedPath);
  if (existedRemoved) {
    ensure(await fileRemove(mainCSSRemovedPath));
  }

  // oriExisted可以判断初见是否被加载
  // 杜绝双重判断！
  if (!oriExisted) {
    // 没有应用插件，为了防止意外，不要重命名为备份，新建一个文件
    ensure(await fileCopy(mainCSSPath, mainCSSOriPath));
  }

  curMainRecord = await readMain();

  // 读出来的时候，是当前的bgName，之后如果自刷新，就会修改
  // if (curMainRecord) {
  //   context.globalState.update(global_keys.IS_INNER, curMainRecord.isInner);
  //   context.globalState.update(global_keys.BG_NAME, curMainRecord.bgName);
  // }

  // switch模式
  if (isSwitchModel()) {
    await refreshMain({ useSwitch: true });
    if (!oriExisted) reloadWindow();
  } else {
    if (!oriExisted || configObj.get<boolean>(config_ids.AUTO_REFRESH, true)) {
      await refreshMain(curMainRecord, configObj);
      if (!oriExisted) reloadWindow();
    }
  }

  //
  //   if (!oriExisted) {
  //     // 初次使用
  //     await refreshMain(curMainRecord, configObj);
  //     reloadWindow();
  //     // context.globalState.update(global_keys.INITTED, true)
  //   } else if (configObj.get<boolean>(config_ids.AUTO_REFRESH, true)) {
  //     // 自刷新
  //     await refreshMain(curMainRecord, configObj);
  //   }
  //   return;
}

function configBGLoader() {
  MultiStepInput.run(async (input) => {
    let i = 0;
    const configObj = vscode.workspace.getConfiguration();
    const textItems = [
      "自定义壁纸(打开用户壁纸文件夹)",
      "刷新壁纸",
      "打开壁纸视图",
      "打开加载器配置",
      configObj.get<boolean>(config_ids.ENABLED)
        ? "禁用壁纸加载器"
        : "启用壁纸加载器",
    ];

    const items: CommonPickItem[] = textItems.map((label) => ({
      id: i++,
      label,
    }));
    const pick = (await input.showQuickPick({
      title: "配置壁纸加载器",
      items,
    })) as CommonPickItem;
    switch (pick.id) {
      case 0:
        vscode.commands.executeCommand(command_ids.OPEN_USER_DIR);
        break;
      case 1:
        vscode.commands.executeCommand(command_ids.REFRESH_BG);
        break;
      case 2:
        showBGLoaderView();
        break;
      case 3:
        vscode.commands.executeCommand(
          "workbench.action.openSettings",
          `${PLUGIN_NAME}`
        );
        break;
      case 4:
        if (configObj.get<boolean>(config_ids.ENABLED)) {
          // 启用->禁用
          vscode.commands.executeCommand(command_ids.DISABLE_EXT);
        } else {
          vscode.commands.executeCommand(command_ids.ENABLE_EXT);
        }
        break;
    }
  });
}
async function showBGLoaderView() {
  const availableBGs = await getAvailableBGs();

  const panel = vscode.window.createWebviewPanel(
    "bgManagerPanel",
    availableBGs.isInner ? "内置壁纸" : "我的壁纸",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        extensionUri,
        vscode.Uri.file(innerDir),
        vscode.Uri.file(userDir),
      ],
    }
  );
  panel.webview.html = await getWebviewContent(panel.webview, availableBGs);
  panel.webview.onDidReceiveMessage(async (message) => {
    // 根据消息类型执行对应操作
    const payload = message.payload;
    switch (message.type) {
      case "msg":
        console.log(payload);
        break;
      case "bgSelected": {
        const configObj = vscode.workspace.getConfiguration();
        if (configObj.get(config_ids.USE_SWITICH_ANIMATION)) {
          vscode.window
            .showInformationMessage(
              "选中当前壁纸，将会禁用动态图更新，确定吗？",
              "确定",
              "取消"
            )
            .then(async (res) => {
              if (res === "确定") {
                await writeMain({
                  useSwitch: false,
                  paperInfo: {
                    isInner: availableBGs.isInner,
                    fileName: payload,
                  },
                });
                updateConfig(
                  config_ids.USE_SWITICH_ANIMATION,
                  false,
                  configObj
                );
              }
            });
        } else {
          await writeMain({
            useSwitch: false,
            paperInfo: { isInner: availableBGs.isInner, fileName: payload },
          });
          reloadWindow();
        }

        break;
      }
      case "bgBanned": {
        // TODO 禁用或者删除之后，要看看是不是当前的壁纸，以及保证下一次启动的壁纸
        const realPath = path.join(
          availableBGs.isInner ? innerDir : userDir,
          payload
        );
        console.log("想要禁用的文件是：", realPath);

        const removeUsed = context.globalState.get<boolean>(
          global_keys.REMOVE_USED,
          false
        );
        let useRemove = vscode.workspace
          .getConfiguration()
          .get<boolean>(config_ids.USE_REMOVE);
        if (!removeUsed) {
          await new Promise((f1, f2) => {
            vscode.window
              .showInformationMessage(
                "首次移除壁纸，请选择是要禁用壁纸或者是直接删除壁纸（可在配置处更改）",
                "只禁用，不删除",
                "删除壁纸"
              )
              .then((res) => {
                if (res === "只禁用，不删除") {
                  useRemove = false;
                  updateConfig(config_ids.USE_REMOVE, useRemove).then(()=>{f1(true);});
                  
                } else {

                  useRemove = true;
                  updateConfig(config_ids.USE_REMOVE, useRemove).then(()=>{f1(true)})
                }
              });
          });
          context.globalState.update(global_keys.REMOVE_USED, true);
        }

        if (useRemove) {
          await fileRemove(realPath);
        } else {
          await filePathAddRemoved(realPath);
          availableBGs.removedFiles.push(`removed-${payload}`);
        }
        availableBGs.bgFiles = availableBGs.bgFiles.filter(
          (file) => file !== payload
        );

        // 刷新
        panel.webview.html = await getWebviewContent(
          panel.webview,
          availableBGs
        );

        // 检查，如果用的是main当中的，就刷掉，以防下一次还用
        // 但如果是当前的，那就不换
        // const mainObj = await readMain();
        // if (
        //   mainObj &&
        //   availableBGs.isInner === mainObj.isInner &&
        //   payload === mainObj.bgName
        // ) {
        //   await refreshMain(null);
        // }

        checkRemovedAndRefresh({
          isInner: availableBGs.isInner,
          fileName: payload,
        });

        break;
      }
      case "bgRemoved": {
        const realPath = path.join(
          availableBGs.isInner ? innerDir : userDir,
          payload
        );
        await fileRemove(realPath);

        // 检查
        availableBGs.bgFiles = availableBGs.bgFiles.filter(
          (file) => file !== payload
        );
        availableBGs.removedFiles = availableBGs.removedFiles.filter(
          (file) => file !== payload
        );
        panel.webview.html = await getWebviewContent(
          panel.webview,
          availableBGs
        );

        // 检查
        // const mainObj = await readMain();
        // if (
        //   mainObj &&
        //   availableBGs.isInner === mainObj.isInner &&
        //   payload === mainObj.bgName
        // ) {
        //   await refreshMain(null);
        // }

        checkRemovedAndRefresh({
          isInner: availableBGs.isInner,
          fileName: payload,
        });

        break;
      }
      case "bgStartup":
        console.log(`重新启用:${payload}`);

        await filePathCleanRemoved(
          path.join(availableBGs.isInner ? innerDir : userDir, payload)
        );

        availableBGs.bgFiles.push((<string>payload).replace("removed-", ""));
        availableBGs.removedFiles = availableBGs.removedFiles.filter(
          (file) => file !== payload
        );

        panel.webview.html = await getWebviewContent(
          panel.webview,
          availableBGs
        );

        break;
    }
  });
  panel.onDidDispose(() => {});
}

// 当某个文件删除的时候，是否需要更改style
async function checkRemovedAndRefresh(paperInfo: PaperInfo) {
  const mainObj = await readMain();
  if (!mainObj) return;

  if (
    !mainObj.useSwitch &&
    mainObj.paperInfo!.isInner === paperInfo.isInner &&
    mainObj.paperInfo!.fileName === paperInfo.fileName
  ) {
    await refreshMain({ useSwitch: false, paperInfo });
  } else if (mainObj.useSwitch) {
    await refreshMain({ useSwitch: true });
  }

  // if (
  //   mainObj &&
  //   mainObj.isInner === removedObj.isInner &&
  //   mainObj.bgName === removedObj.bgName
  // ) {
  //   await refreshMain(null);
  // }
}

type AvailableBGs = {
  isInner: boolean;
  bgFiles: string[];
  removedFiles: string[];
};

// 非switch下main中写回当前应用的bg
async function recover() {
  // const mainObj = await readCur();
  // if (mainObj) {
  //   return await writeMain(mainObj);
  // }
  const mainEntity = await readCur();

  if (mainEntity && !mainEntity.useSwitch) {
    return await writeMain(mainEntity);
  }

  return true;
}

async function getAvailableBGs() {
  let files = await dirRead(userDir);
  if (!files || files.length === 0) {
    // 使用内置
    await initInnerBGs();
    files = await dirRead(innerDir);
    const [bgFiles, removedFiles] = filterRemoved(files);
    return {
      isInner: true,
      bgFiles: bgFiles,
      removedFiles: removedFiles,
    } as AvailableBGs;
  } else {
    const [bgFiles, removedFiles] = filterRemoved(files);
    return {
      isInner: false,
      bgFiles: bgFiles,
      removedFiles: removedFiles,
    } as AvailableBGs;
  }
}

async function getWebviewContent(
  webview: vscode.Webview,
  availableBGs: AvailableBGs
) {
  const prefix = path.join(
    workbenchPath!,
    "loader",
    availableBGs.isInner ? "inner" : "user"
  );

  const itemsContent = availableBGs.bgFiles
    .map((file) => {
      const uri = webview.asWebviewUri(
        vscode.Uri.file(path.join(prefix, file))
      );
      // 防止文件名太长
      return `<div class="wallpaper-item" data-path="${file}"><img src="${uri}" data-path="${file}"/><div>${getDisplayFilename(
        file
      )}</div></div>`;
    })
    .join("");

  const removedItemsContent = availableBGs.removedFiles
    .map((file) => {
      const uri = webview.asWebviewUri(
        vscode.Uri.file(path.join(prefix, file))
      );
      return `<div class="wallpaper-item" data-path="${file}"><img class="removed" src="${uri}" data-path="${file}" data-removed="true"/><div style="text-decoration: line-through">${getDisplayFilename(
        file.replace("removed-", "")
      )}</div></div>`;
    })
    .join("");

  const nonce = getNonce();

  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "main.js")
  );

  return `
	<!DOCTYPE html>
<html lang="en">
  <head>
	<meta charset="UTF-8" />
	<meta http-equiv="X-UA-Compatible" content="IE=edge" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Document</title>
  </head>
  <style>
	.container {
	  position: relative;
	}
	.wallpaper-item {
	  display: inline-block;
	  margin: 10px;
	  cursor: pointer;
	  text-align: center;
	}
	.wallpaper-item img {
	  width: 200px;
	  height: 150px;
	  object-fit: cover;
	  border-radius: 5px;
	}
	.wallpaper-item .removed{
	  width: 200px;
	  height: 150px;
	  object-fit: cover;
	  border-radius: 5px;
	  filter: grayscale(100%);
	}
	.menu {
	  position: absolute;
	  color: rgba(36, 35, 35, 0.6);
	  background-color: #fff;
	  border: 1px solid #ccc;
	  padding: 8px;
	  left: 125px;
	  top: 72px;
	}

	.menu ul {
	  list-style-type: none;
	  margin: 0;
	  padding: 0;
	}

	.menu li {
	  cursor: pointer;
	  padding: 1px 2px;
	}

	.menu li:hover {
	  background-color: #f0f0f0;
	}
	.filename-text {
	  white-space: nowrap; /* 不换行 */
	  overflow: hidden; /* 溢出部分隐藏 */
	  text-overflow: ellipsis; /* 超出部分显示省略号 */
	}
	.file-name::after {
	  content: '.jpg'; /* 后缀名 */
	}

  </style>
  <body>
	<div class="container">
	  <div class="wallpaper-list">
	  ${itemsContent}${removedItemsContent}</div>
	  <div id="context-menu" class="menu" style="display: none">
		<ul>
		  ${
        // inner壁纸不能删除
        availableBGs.isInner
          ? "<li id='select'>应用该壁纸</li><li>注：内置壁纸不能禁用</li>"
          : "<li id='select'>应用该壁纸</li><li id='ban'>禁用该壁纸</li>"
      }
		</ul>
	  </div>
	  <div id="context-menu-banned" class="menu" style="display: none">
		<ul>
		  <li id='startup'>启用该壁纸</li>
		  <li id='remove'>删除该壁纸</li>
		</ul>
	  </div>
	</div>
	<script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>

	`;
}

// 排除curMainRecord中的内容进行写入
// 如果是null就表示随便刷一张，只要刷就行
async function refreshMain(
  curMainRecord: MainEntity | null,
  configObj: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration()
) {
  return new Promise<boolean>(async (f1, f2) => {
    if (!curMainRecord) {
      // 强刷
      // 在这里造一个mainEntity
      const useSwitch = vscode.workspace
        .getConfiguration()
        .get(config_ids.USE_SWITICH_ANIMATION);
      if (useSwitch) {
        f1(await writeMain({ useSwitch: true }));
        return;
      } else {
        const availableBGs = await getAvailableBGs();
        const index = randomInt(availableBGs.bgFiles.length);
        const selectedBG = availableBGs.bgFiles[index];
        f1(
          await writeMain(
            {
              useSwitch: false,
              paperInfo: {
                isInner: availableBGs.isInner,
                fileName: selectedBG,
              },
            },
            configObj
          )
        );
      }
      return;
    }
    if (curMainRecord.useSwitch) {
      // 强刷
      f1(await writeMain(curMainRecord));
      return;
    }

    // 过滤removed
    const availableBGs = await getAvailableBGs();
    // 排除当前的
    if (
      curMainRecord!.paperInfo &&
      availableBGs.isInner === curMainRecord.paperInfo.isInner
    )
      availableBGs.bgFiles = availableBGs.bgFiles.filter(
        (file) => file !== curMainRecord.paperInfo!.fileName
      );

    const index = randomInt(availableBGs.bgFiles.length);
    const selectedBG = availableBGs.bgFiles[index];

    f1(
      await writeMain(
        {
          useSwitch: false,
          paperInfo: { isInner: availableBGs.isInner, fileName: selectedBG },
        },
        configObj
      )
    );
  });
}

// 现在开始，不区分style和Path了，直接更改main
// 单纯写入mainObj的内容或者被安排使用switch
async function writeMain(
  mainObj: MainEntity,
  configObj: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration()
) {
  return new Promise<boolean>(async (f1, f2) => {
    // let useSwitchAni = configObj.get<boolean>(config_ids.USE_SWITICH_ANIMATION);
    let useSwitchAni = mainObj.useSwitch;

    let useZoomAni = configObj.get<boolean>(config_ids.USE_ZOOM_ANIMATION);

    let bgPath = "";
    if (!useSwitchAni) bgPath = getCSSBGPath(mainObj.paperInfo!);
    // 检查一下bgPath是否存在
    const realPath = path.join(workbenchPath!, bgPath);
    if (!(await fileExisted(realPath))) {
      f2("壁纸文件不存在！");
      return;
    }
    // 添加了switch相关
    let zoomDef = "";
    let switchDef = "";
    let animationTemplate = "";
    if (useZoomAni || useSwitchAni) {
      animationTemplate += "animation:";
      if (useZoomAni) {
        // animationTemplate
        {
          animationTemplate += `zoom ${configObj.get<number>(
            config_ids.ZOOM_CIRCLE,
            config_default.ZOOM_CIRCLE
          )}s infinite ease-in-out`;
          if (useSwitchAni) {
            animationTemplate += ",";
          } else {
            animationTemplate += ";";
          }
        }
        // zoomDef
        {
          zoomDef = `@keyframes zoom{0%{background-size:100%;}50%{background-size:${configObj.get<number>(
            config_ids.ZOOM_SCALE,
            config_default.ZOOM_SCALE
          )}%;}100%{background-size:100%;}}`;
        }
      }
      if (useSwitchAni) {
        {
          let switchCircle: number = 0;
          if (useSwitchAni) {
            const availableBGs = await getAvailableBGs();
            const length = availableBGs.bgFiles.length;
            // animationTemplate
            {
              switchCircle = configObj.get<number>(
                config_ids.SWITCH_CIRCLE,
                config_default.SWITCH_CIECLE
              );
              switchCircle = switchCircle * length;
              animationTemplate += `switch ${switchCircle}s infinite steps(1);`;
            }
            // switchDef
            {
              const prefix = `loader/${
                availableBGs.isInner ? "inner" : "user"
              }`;
              const incre = Math.floor(100 / length);
              let curStep = 0;
              switchDef = "@keyframes switch{";
              // 打乱
              const shuffledFiles = shuffleArray(availableBGs.bgFiles);
              for (const bg of shuffledFiles) {
                switchDef += `${curStep}%{background-image:url(${prefix}/${bg});}`;
                curStep += incre;
              }
              switchDef += "}";
            }
          }
        }
      }
    }
    // switch下，body里面就不要写background-image了，而且有特定的switchTip标识
    let mainContent = `@import url("${mainCSSOriName}");body{${
      useSwitchAni ? "" : `background-image:url(${bgPath});`
    }background-repeat:no-repeat;background-position:center;background-size:cover;opacity:${configObj.get<number>(
      config_ids.OPACITY,
      config_default.OPACITY
    )};${animationTemplate}}${zoomDef}${switchDef}`;

    const ws = fs.createWriteStream(mainCSSPath);
    ws.write(mainContent, "utf-8", async (err) => {
      if (err) {
        console.error(err);
        f2(err);
      } else {
        f1(true);
      }
      ws.close();
    });
  });
}

type PaperInfo = {
  isInner: boolean;
  fileName: string;
};

type MainEntity = {
  useSwitch: boolean;
  paperInfo?: PaperInfo;
};

// 读取当前应用的壁纸
async function readCur() {
  if (curMainRecord) return curMainRecord;
  return await readMain();
  // const isInner = context.globalState.get<boolean>(global_keys.IS_INNER);
  // const bgName = context.globalState.get<string>(global_keys.BG_NAME);
  // if (isInner !== undefined && bgName) {
  //   return {
  //     useSwitch: false,
  //     paperInfo: {
  //       isInner,
  //       bgName,
  //     },
  //   } as MainEntity;
  // } else return await readMain();
}

// 强行读取main
async function readMain() {
  const existed = await new Promise((f1, f2) => {
    fs.access(mainCSSPath, (err) => {
      f1(err ? false : true);
    });
  });
  if (!existed) {
    throw error("main不存在!!!");
  }
  const content = await new Promise<string>((f1, f2) => {
    fs.readFile(mainCSSPath, (err, data) => {
      if (err) f2();
      else {
        f1(data.toString());
      }
    });
  });
  if (!content) {
    return null;
  }

  const switchMatch = content.match(switchTip);

  if (switchMatch) {
    return { useSwitch: true } as MainEntity;
  }

  const infoMatch = content.match(/:url\(loader\/(.*?)\/(.*?)\)/);
  if (!infoMatch || infoMatch.length < 3) {
    // 没内容
    return null;
  }

  return {
    useSwitch: false,
    paperInfo: {
      isInner: infoMatch[1] === "inner",
      fileName: infoMatch[2],
    },
  } as MainEntity;
}

function makePath(workbenchPath: string) {
  loaderDir = path.join(workbenchPath, "loader");
  innerDir = path.join(loaderDir, "inner");
  userDir = path.join(loaderDir, "user");

  mainCSSPath = path.join(workbenchPath, mainCSSName);
  mainCSSBakPath = `${mainCSSPath}-bak`;
  mainCSSOriPath = path.join(workbenchPath, `${mainCSSOriName}`);
  mainCSSRemovedPath = `${mainCSSPath}-removed`;
}

async function initInnerBGs() {
  const files = await new Promise<string[]>((resolve, reject) => {
    fs.readdir(path.join(MEDIA_DIR, "img"), (err, files) => {
      if (err) {
        console.error(err);
        reject(err);
      } else {
        resolve(files);
      }
    });
  });

  if (!files) return false;

  for (const file of files) {
    const dstFile = path.join(innerDir, file);
    const existed = await new Promise((f1, f2) => {
      fs.access(dstFile, (err) => {
        f1(err ? false : true);
      });
    });
    if (!existed) {
      const srcFile = path.join(MEDIA_DIR, "img", file);
      // 如果没成功，这里报错就可以了，直接截断
      ensure(
        await new Promise((f1, f2) => {
          fs.cp(srcFile, dstFile, (err) => {
            f1(err ? false : true);
          });
        })
      );
    }
  }
  return true;
}

function filterRemoved(files: string[]) {
  const removedFiles: string[] = [];

  files = files.filter((file) => {
    if (file.startsWith("removed-")) {
      removedFiles.push(file);
      return false;
    }
    return true;
  });
  return [files, removedFiles];
}

async function filePathAddRemoved(realPath: string) {
  const dirPath = getDirPath(realPath);
  const filename = getFilename(realPath);
  await fileRename(realPath, path.join(dirPath, `removed-${filename}`));
}

async function filePathCleanRemoved(realPath: string) {
  const dirPath = getDirPath(realPath);
  const filename = getFilename(realPath);
  await fileRename(
    realPath,
    path.join(dirPath, filename.replace("removed-", ""))
  );
}

function getCSSBGPath(mainObj: PaperInfo) {
  return `loader/${mainObj.isInner ? "inner" : "user"}/${mainObj.fileName}`;
}

function reloadWindow() {
  vscode.commands.executeCommand("workbench.action.reloadWindow");
}

function showInfoBeforeReload(info: string) {
  vscode.window.showInformationMessage(info, "确定", "待会").then((choice) => {
    if (choice === "确定") {
      reloadWindow();
    }
  });
}

// 检测输入值是否合法，现在遗弃，交给package.json
async function checkConfigUpdate(event: vscode.ConfigurationChangeEvent) {
  return new Promise<boolean>((f1, f2) => {
    const configObj = vscode.workspace.getConfiguration();
    if (event.affectsConfiguration(config_ids.OPACITY)) {
      const curValue = configObj.get<number>(config_ids.OPACITY);
      if (!curValue || curValue >= 1) {
        vscode.window.showErrorMessage(
          `${config_ids.OPACITY} settings an invalid value!`
        );
        configObj
          // 改为用户原始的值
          .update(
            config_ids.OPACITY,
            lastConfigObj,
            vscode.ConfigurationTarget.Global
          )
          .then(() => {
            f1(false);
          });
      } else {
        updateConfig(config_ids.OPACITY, curValue,lastConfigObj).then(() => {
          f1(true);
        });
      }
    } else if (event.affectsConfiguration(config_ids.ZOOM_CIRCLE)) {
      const curValue = configObj.get<number>(config_ids.ZOOM_CIRCLE);
      if (!curValue) {
        vscode.window.showErrorMessage(
          `${config_ids.ZOOM_CIRCLE} settings an invalid value!`
        );
        configObj
          // 改为用户原始的值
          .update(
            config_ids.ZOOM_CIRCLE,
            lastConfigObj,
            vscode.ConfigurationTarget.Global
          )
          .then(() => {
            f1(false);
          });
      } else {
        updateConfig(config_ids.ZOOM_CIRCLE, curValue,lastConfigObj).then(()=>{
          f1(true);
        })
      }
    } else if (event.affectsConfiguration(config_ids.ZOOM_SCALE)) {
      const curValue = configObj.get<number>(config_ids.ZOOM_SCALE);
      if (!curValue) {
        vscode.window.showErrorMessage(
          `${config_ids.ZOOM_SCALE} settings an invalid value!`
        );
        configObj
          // 改为用户原始的值
          .update(
            config_ids.ZOOM_SCALE,
            lastConfigObj,
            vscode.ConfigurationTarget.Global
          )
          .then(() => {
            f1(false);
          });
      } else {
        updateConfig(config_ids.ZOOM_SCALE, curValue,lastConfigObj).then(()=>{
          f1(true);
        })
      }
    } else {
      f1(true);
    }
  });
}

async function checkEnabledAndTip(tip?: string) {
  return new Promise((f1, f2) => {
    if (!extEnabled) {
      vscode.window
        .showInformationMessage(
          `${tip ? tip : "此操作只有在插件启用后才能执行，是否现在启用插件？"}`,
          "确定",
          "取消"
        )
        .then((res) => {
          if (res === "确定") {
            vscode.commands.executeCommand(command_ids.ENABLE_EXT).then(() => {
              f1(true);
            });
          } else {
            f1(false);
          }
        });
    } else {
      f1(true);
    }
  });
}

function isSwitchModel() {
  return getConfig<boolean>(config_ids.USE_SWITICH_ANIMATION);
}

function extEnabled() {
  return getConfig<boolean>(config_ids.ENABLED);
}

function getConfig<T>(configId: string) {
  return vscode.workspace.getConfiguration().get<T>(configId);
}

function getConfigWithDefault<T>(configId: string, defaultValue: T) {
  return vscode.workspace.getConfiguration().get<T>(configId, defaultValue);
}

function updateConfig(
  configId: string,
  newValue: any,
  configObj: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration()
) {
  return configObj.update(
    configId,
    newValue,
    vscode.ConfigurationTarget.Global
  );
}

// 插件禁用之后，移除之前所有的内置操作
export async function onDisable() {
  console.log("插件被禁用，开始执行还原操作。。。");

  if (!workbenchPath) {
    const appRoot = vscode.env.appRoot;
    workbenchPath = path.join(appRoot, "out", "vs", "workbench");
  }
  makePath(workbenchPath);

  const data = fs.readFileSync(mainCSSOriPath);

  const ws = fs.createWriteStream(mainCSSPath);
  const res = await new Promise((f1, f2) => {
    ws.write(data.toString(), (err) => {
      if (err) {
        vscode.window.showErrorMessage("遇到问题");
        f2(false);
      }
      f1(true);
    });
  });

  if (!res) {
    return;
  }

  for (const key of context.globalState.keys()) {
    context.globalState.update(key, undefined);
  }
  vscode.workspace
    .getConfiguration()
    .update(config_ids.ENABLED, false, vscode.ConfigurationTarget.Global);

  fs.renameSync(mainCSSOriPath, mainCSSRemovedPath);

  fs.rmSync(innerDir, { recursive: true, force: true });
  console.log("删除innerDir");
  // 用户目录不删除如果有用户的文件就不删除

  const files = fs.readdirSync(userDir);
  if (files.length === 0) {
    fs.rmSync(loaderDir, { recursive: true, force: true });
    console.log("删除loaderDir");
  } else {
    console.log("不删除userDir");
  }

  console.log("还原完成");
}

export function deactivate() {}

//有一件事，就是比如我监听用户的更改，每次改一下就进行一下回调，每次回调都需要io操作，会比较慢的,但是如果用户改的太快，会回调多次，怎么做到就是让最后一次生效，
