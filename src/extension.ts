import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  global_keys,
  MEDIA_DIR,
  PLUGIN_CN_NAME,
  PLUGIN_NAME,
  command_ids,
  config_ids,
  config_default,
} from "./global";
import {
  ensure,
  dirRead,
  fileCopy,
  fileExisted,
  fileRead,
  fileRemove,
  fileRename,
  fileWrite,
  getDirPath,
  getDisplayFilename,
  getFilename,
  getNonce,
  initDir,
  randomInArray,
  replaceAll,
  shuffleArray,
  withThrottle,
  isOfType,
  withThrottleByDay,
} from "./utils";
import { error } from "console";
import { CommonPickItem, MultiStepInput } from "./multistepHelper";

let workbenchPath: string | undefined;
let appRoot: string;
let outPath: string;

const mainCSSName = "workbench.desktop.main.css";
const mainCSSOriName: string = `ori_${mainCSSName}`;
const switchTip: string = "@keyframes switch";

let mainCSSPath: string;
let mainCSSBakPath: string;
let mainCSSOriPath: string;
// let mainCSSRemovedPath: string;

let loaderDir: string;
let userDir: string;
let innerDir: string;

let extensionUri: vscode.Uri;

let updateConfigTimer: NodeJS.Timeout | undefined;

let context: vscode.ExtensionContext;

let bakExisted: boolean;
let oriExisted: boolean;

// 用来控制回调是否生效
// let loaderMainPromise: Promise<boolean> | undefined

// 只有reloadWindow之后才会改
let curMainEntity: MainEntity | null = null;

// 禁用状态下只能做一个操作：启用

let userDirWatcher: vscode.FileSystemWatcher | undefined;


export async function activate(_context: vscode.ExtensionContext) {
  // 启动配置
  if (!workbenchPath) {
    appRoot = vscode.env.appRoot;
    workbenchPath = path.join(appRoot, "out", "vs", "workbench");
  }
  formatPath();
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

  ensure(await initDir(innerDir));
  ensure(await initDir(userDir));

  // 禁用情况下的注册
  context.subscriptions.push(
    vscode.commands.registerCommand(command_ids.DISABLE_EXT, async () => {
      if (!isExtEnabled()) {
        await onDisable();
        reloadWindow();
      }
    }),
    vscode.commands.registerCommand(command_ids.ENABLE_EXT, async () => {
      if (isExtEnabled()) {
        updateConfig(config_ids.ENABLED, true).then(() => {
          loaderMain();
        });
      }
    }),
    vscode.commands.registerCommand(command_ids.OPEN_USER_DIR, () => {
      checkEnabledAndTip();
      vscode.env.openExternal(vscode.Uri.file(userDir));
    }),
    vscode.commands.registerCommand(command_ids.CONFIG_LOADER, () => {
      configLoader();
    }),
    vscode.commands.registerCommand(command_ids.REFRESH_PAPER, async () => {
      // 禁用下不可用
      if (!isExtEnabled()) {
        vscode.window
          .showInformationMessage(
            "此操作只有在插件启用后才能执行，是否现在启用插件？",
            "确定",
            "取消"
          )
          .then((res) => {
            if (res === "确定") {
              enable();
            }
          });
        return;
      }

      if (isSwitchModel()) {
        vscode.window.showInformationMessage(
          `当前壁纸每${vscode.workspace
            .getConfiguration()
            .get(config_ids.SWITCH_CYCLE)}秒就会切换一次哦！`
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
    vscode.commands.registerCommand(
      command_ids.ON_USER_DIR_UPDATE,
      withThrottle(async () => {
        // 如果是swtich模式，提示要改

        const curMainRecord = await readCur();
        await refreshMain(curMainRecord);

        showInfoBeforeReload(
          "用户自定义目录发现变更，是否要重启以应用新壁纸？"
        );
      }, 1000)
    ),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("style")) {
        // 修改两次，防止style和用户配置不同步的情况
        context.globalState.update(global_keys.STYLE_UPDATE, true);

        // 如果插件是禁用状态，什么都不管
        if (!isExtEnabled()) return;

        clearTimeout(updateConfigTimer);
        updateConfigTimer = setTimeout(async () => {
          // 重新读取配置

          // let curMain = await readCur();
          // if (!isSwitchModel()) {
          //   if (!curMain || !curMain.paperInfo) {
          //     const availablePapers = await getAvailablePapers();
          //     const selectedFile = randomInArray(availablePapers.files);
          //     curMain = {
          //       useSwitch: false,
          //       paperInfo: {
          //         isInner: availablePapers.isInner,
          //         fileName: selectedFile,
          //       },
          //     };
          //   }
          // } else {
          //   if (!curMain) {
          //     curMain = { useSwitch: true };
          //   }
          // }
          // const success = await writeMain(curMain);

          // const success = await writeMain(curMain);

          const success = await refreshMain(curMainEntity);

          if (success) {
            showInfoBeforeReload("修改后需要重启vscode,现在重启吗?");
          }
        }, 100);
      } else if (event.affectsConfiguration(config_ids.AUTO_REFRESH)) {
        if (!isExtEnabled()) return;
        if (getConfig<boolean>(config_ids.AUTO_REFRESH)) {
          // 开启自动刷新
          // 更改一次
          const curMainRecord = await readCur();
          await refreshMain(curMainRecord);
          // 不直接刷新
          // reloadWindow()
        } else {
          // 关闭自动刷新，就写回来
          await recover();
        }
      } else if (event.affectsConfiguration(config_ids.ENABLED)) {
        if (isExtEnabled()) {
          vscode.commands.executeCommand(command_ids.ENABLE_EXT);
        } else {
          vscode.window
            .showInformationMessage(
              "你确定要禁用壁纸加载器吗？",
              "确定",
              "取消"
            )
            .then((res) => {
              if (res === "确定") {
                vscode.commands.executeCommand(command_ids.DISABLE_EXT);
              }
              // else {
              //   updateConfig(config_ids.ENABLED, true);
              // }
            });
        }
      }
    })
  );

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  statusBarItem.text = `$(octoface) ${PLUGIN_CN_NAME}`;
  statusBarItem.command = command_ids.CONFIG_LOADER;
  statusBarItem.show();

  bakExisted = await fileExisted(mainCSSBakPath);
  oriExisted = await fileExisted(mainCSSOriPath);
  // const configObj = vscode.workspace.getConfiguration();
  if (isExtEnabled()) {
    await loaderMain();
  }

  console.log("完成");
}

async function loaderMain() {
  // 查找vscode的位置

  // const existedRemoved = await fileExisted(mainCSSRemovedPath);
  // if (existedRemoved) {
  // ensure(await fileRemove(mainCSSRemovedPath));
  // ensure(await fileRename(mainCSSRemovedPath, mainCSSOriPath));

  // }

  // 最重要的就是优先拷贝
  // write操作一定会一气呵成
  if (!bakExisted) {
    ensure(await fileCopy(mainCSSPath, mainCSSBakPath));
  }
  // oriExisted可以判断初见是否被加载
  // 杜绝双重判断！
  if (!oriExisted) {
    // 没有初始化过插件，为了防止意外，不要重命名为备份，新建一个文件
    // 这个方式可行

    // if (bakExisted) {
    //   ensure(await fileCopy(mainCSSBakPath, mainCSSOriPath));
    // } else {
    //   ensure(await fileCopy(mainCSSPath, mainCSSBakPath));
    //   ensure(await fileCopy(mainCSSPath, mainCSSOriPath));
    // }

    ensure(await fileCopy(mainCSSBakPath, mainCSSOriPath));
    // await fileCopy(mainCSSPath, mainCSSOriPath);

    // 以下不可行
    // const rawMain = await fileRead(mainCSSPath);
    // await fileWrite(mainCSSOriPath, rawMain);
    // if(!bakExisted){
    //   await fileWrite(mainCSSBakPath, rawMain);
    // }
  }

  userDirWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(userDir), "*")
  );

  userDirWatcher.onDidCreate((e) => {
    vscode.commands.executeCommand(command_ids.ON_USER_DIR_UPDATE);
  });

  userDirWatcher.onDidChange((e) => {
    vscode.commands.executeCommand(command_ids.ON_USER_DIR_UPDATE);
  });

  userDirWatcher.onDidDelete((e) => {
    vscode.commands.executeCommand(command_ids.ON_USER_DIR_UPDATE);
  });

  context.subscriptions.push(userDirWatcher);

  curMainEntity = await readMain();

  // switch模式
  if (isSwitchModel()) {
    await refreshMain({ useSwitch: true });

    if (!context.globalState.get(global_keys.INITTED, false)) {
      context.globalState.update(global_keys.INITTED, true).then(() => {
        reloadWindow();
      });
    } else if (!oriExisted) reloadWindow();
  } else {
    const configObj = vscode.workspace.getConfiguration();
    if (
      !oriExisted ||
      configObj.get<boolean>(config_ids.AUTO_REFRESH, true) ||
      context.globalState.get<boolean>(global_keys.STYLE_UPDATE) ||
      !context.globalState.get(global_keys.INITTED, false)
    ) {
      await refreshMain(curMainEntity, configObj);
      context.globalState.update(global_keys.STYLE_UPDATE, false);

      if (!context.globalState.get(global_keys.INITTED, false)) {
        context.globalState.update(global_keys.INITTED, true).then(() => {
          reloadWindow();
        });
      } else if (!oriExisted) reloadWindow();
    }
  }
}

function configLoader() {
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
        vscode.commands.executeCommand(command_ids.REFRESH_PAPER);
        break;
      case 2:
        showLoaderView();
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
          disable();
        } else {
          enable();
        }
        break;
    }
  });
}
async function showLoaderView() {
  const availablePapers = await getAvailablePapers();

  const panel = vscode.window.createWebviewPanel(
    "WallPaperManagerPanel",
    availablePapers.isInner ? "内置壁纸" : "我的壁纸",
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
  panel.webview.html = await getWebviewContent(panel.webview, availablePapers);
  panel.webview.onDidReceiveMessage(async (message) => {
    // 根据消息类型执行对应操作
    const payload = message.payload;
    switch (message.type) {
      // for dubug
      // case "msg":
      //   console.log(payload);
      //   break;
      case "selected": {
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
                  isInner: availablePapers.isInner,
                  file: payload,
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
            isInner: availablePapers.isInner,
            file: payload,
          });
          reloadWindow();
        }

        break;
      }
      case "banned": {
        // TODO 禁用或者删除之后，要看看是不是当前的壁纸，以及保证下一次启动的壁纸
        const realPath = path.join(
          availablePapers.isInner ? innerDir : userDir,
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
                  updateConfig(config_ids.USE_REMOVE, useRemove).then(() => {
                    f1(true);
                  });
                } else {
                  useRemove = true;
                  updateConfig(config_ids.USE_REMOVE, useRemove).then(() => {
                    f1(true);
                  });
                }
              });
          });
          context.globalState.update(global_keys.REMOVE_USED, true);
        }

        if (useRemove) {
          await fileRemove(realPath);
        } else {
          await filePathAddRemoved(realPath);
          availablePapers.removedFiles.push(`removed-${payload}`);
        }
        availablePapers.files = availablePapers.files.filter(
          (file) => file !== payload
        );

        // 刷新
        panel.webview.html = await getWebviewContent(
          panel.webview,
          availablePapers
        );

        checkRemovedAndRefresh({
          isInner: availablePapers.isInner,
          file: payload,
        });

        break;
      }
      case "removed": {
        const realPath = path.join(
          availablePapers.isInner ? innerDir : userDir,
          payload
        );
        await fileRemove(realPath);

        // 检查
        availablePapers.files = availablePapers.files.filter(
          (file) => file !== payload
        );
        availablePapers.removedFiles = availablePapers.removedFiles.filter(
          (file) => file !== payload
        );
        panel.webview.html = await getWebviewContent(
          panel.webview,
          availablePapers
        );

        checkRemovedAndRefresh({
          isInner: availablePapers.isInner,
          file: payload,
        });

        break;
      }
      case "startup":
        console.log(`重新启用:${payload}`);

        await filePathCleanRemoved(
          path.join(availablePapers.isInner ? innerDir : userDir, payload)
        );

        availablePapers.files.push((<string>payload).replace("removed-", ""));
        availablePapers.removedFiles = availablePapers.removedFiles.filter(
          (file) => file !== payload
        );

        panel.webview.html = await getWebviewContent(
          panel.webview,
          availablePapers
        );

        break;
    }
  });
  panel.onDidDispose(() => {});
}

// 当某个文件删除的时候，是否需要更改style
async function checkRemovedAndRefresh(paperInfo: NonSwitchPaper) {
  const mainEntity = await readMain();
  if (!mainEntity) return;

  if (
    !mainEntity.useSwitch &&
    mainEntity.paperInfo!.isInner === paperInfo.isInner &&
    mainEntity.paperInfo!.file === paperInfo.file
  ) {
    await refreshMain({ useSwitch: false, paperInfo });
  } else if (mainEntity.useSwitch) {
    await refreshMain({ useSwitch: true });
  }
}

type AvailablePapers = {
  isInner: boolean;
  files: string[];
  removedFiles: string[];
};

// 非switch下main中写回当前应用的bg
async function recover() {
  const mainEntity = await readCur();

  if (mainEntity && !mainEntity.useSwitch) {
    return await writeMain(mainEntity.paperInfo!);
  }

  return true;
}

async function getAvailablePapers() {
  let files = await dirRead(userDir);
  if (!files || files.length === 0) {
    // 使用内置
    await initInnerPapers();
    files = await dirRead(innerDir);
    const [bgFiles, removedFiles] = filterRemoved(files);
    return {
      isInner: true,
      files: bgFiles,
      removedFiles: removedFiles,
    } as AvailablePapers;
  } else {
    const [bgFiles, removedFiles] = filterRemoved(files);
    return {
      isInner: false,
      files: bgFiles,
      removedFiles: removedFiles,
    } as AvailablePapers;
  }
}

async function getWebviewContent(
  webview: vscode.Webview,
  availablePapers: AvailablePapers
) {
  const prefix = path.join(
    // workbenchPath!,
    outPath!,
    "loader",
    availablePapers.isInner ? "inner" : "user"
  );

  const itemsContent = availablePapers.files
    .map((file) => {
      const uri = webview.asWebviewUri(
        vscode.Uri.file(path.join(prefix, file))
      );
      // 防止文件名太长
      return `<div class="wallpaper-item" data-path="${file}"><img class="usable" src="${uri}" data-path="${file}"/><div>${getDisplayFilename(
        file
      )}</div></div>`;
    })
    .join("");

  const removedItemsContent = availablePapers.removedFiles
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
        availablePapers.isInner
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
  curMainEntity: MainEntity | null,
  configObj: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration()
) {
  return new Promise<boolean>(async (f1, f2) => {
    if (isSwitchModel()) {
      const availablePapers = await getAvailablePapers();
      f1(
        await writeMain({
          isInner: availablePapers.isInner,
          files: availablePapers.files,
        })
      );

      if (
        availablePapers.isInner &&
        context.globalState.get(global_keys.TIP_INNER, true)
      ) {
        tipInner();
      }

      return;
    }

    // 非switch
    if (!curMainEntity) {
      const availablePapers = await getAvailablePapers();
      const selectedBG = randomInArray(availablePapers.files);
      f1(
        await writeMain(
          {
            isInner: availablePapers.isInner,
            file: selectedBG,
          } as NonSwitchPaper,

          configObj
        )
      );
      if (
        availablePapers.isInner &&
        context.globalState.get(global_keys.TIP_INNER, true)
      ) {
        tipInner();
      }
      return;
    }

    const availablePapers = await getAvailablePapers();
    // 排除当前的
    if (
      curMainEntity!.paperInfo &&
      availablePapers.isInner === curMainEntity.paperInfo.isInner
    ) {
      availablePapers.files = availablePapers.files.filter(
        (file) => file !== curMainEntity.paperInfo!.file
      );
    }

    const selectedFile = randomInArray(availablePapers.files);
    f1(
      await writeMain(
        {
          isInner: availablePapers.isInner,
          file: selectedFile,
        },
        configObj
      )
    );
    if (
      availablePapers.isInner &&
      context.globalState.get(global_keys.TIP_INNER, true)
    ) {
      tipInner();
    }
  });
}

async function writeEmptyMain() {
  return new Promise<boolean>(async (f1, f2) => {
    const mainContent = `@import url("${mainCSSOriName}");`;
    if (await fileWrite(mainCSSPath, mainContent).catch((err) => f2(err))) {
      f1(true);
    }
  });
}

function isNonSwitchPaper(
  entity: NonSwitchPaper | SwitchPaper
): entity is NonSwitchPaper {
  return isOfType<NonSwitchPaper>(entity, "file");
}

function isSwitchPaper(
  entity: NonSwitchPaper | SwitchPaper
): entity is SwitchPaper {
  return isOfType<SwitchPaper>(entity, "files");
}

// 用PaperInfo和PapersInfo来区分是否使用switch
// 不要在这里面判断是否是switch模式
async function writeMain(
  paperInfo: NonSwitchPaper | SwitchPaper,
  configObj: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration()
) {
  return new Promise<boolean>(async (f1, f2) => {
    let useSwitchAni = isSwitchPaper(paperInfo);

    let useZoomAni = configObj.get<boolean>(config_ids.USE_ZOOM_ANIMATION);

    let relativePaperPath = "";
    if (!useSwitchAni) {
      relativePaperPath = getRelativeCSSPaperPath(paperInfo as NonSwitchPaper);
      // 检查一下bgPath是否存在
      const realPath = path.join(workbenchPath!, relativePaperPath);
      if (!(await fileExisted(realPath))) {
        f2("壁纸文件不存在！");
        return;
      }
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
            config_ids.ZOOM_CYCLE,
            config_default.ZOOM_CYCLE
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
          if (useSwitchAni) {
            const availablePapers = paperInfo as SwitchPaper;
            const length = availablePapers.files.length;
            // animationTemplate
            {
              let switchCycle = configObj.get<number>(
                config_ids.SWITCH_CYCLE,
                config_default.SWITCH_CYCLE
              );
              switchCycle = switchCycle * length;
              animationTemplate += `switch ${switchCycle}s infinite steps(1);`;
            }
            // switchDef
            {
              // const prefix = `${loaderPrefix}/${
              //   availablePapers.isInner ? "inner" : "user"
              // }`;
              const isInner = availablePapers.isInner;
              const incre = Math.floor(100 / length);
              let curStep = 0;
              switchDef = "@keyframes switch{";
              // 打乱
              const shuffledFiles = shuffleArray(availablePapers.files);
              for (const fileName of shuffledFiles) {
                switchDef += `${curStep}%{background-image:url(${getRelativeCSSPaperPath(
                  { isInner, file: fileName }
                )});}`;
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
      useSwitchAni ? "" : `background-image:url(${relativePaperPath});`
    }background-repeat:no-repeat;background-position:center;background-size:cover;opacity:${configObj.get<number>(
      config_ids.OPACITY,
      config_default.OPACITY
    )};${animationTemplate}}${zoomDef}${switchDef}`;

    if (await fileWrite(mainCSSPath, mainContent).catch((err) => f2(err))) {
      f1(true);
    }
  });
}

// async function writeMain(
//   mainEntity: SingleEntity,
//   configObj: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration()
// ) {
//   return new Promise<boolean>(async (f1, f2) => {
//     let useSwitchAni = configObj.get<boolean>(config_ids.USE_SWITICH_ANIMATION);

//     let useZoomAni = configObj.get<boolean>(config_ids.USE_ZOOM_ANIMATION);

//     let relativePaperPath = "";
//     if (!useSwitchAni) {
//       relativePaperPath = getRelativeCSSPaperPath(mainEntity.paperInfo!);
//       // 检查一下bgPath是否存在
//       const realPath = path.join(workbenchPath!, relativePaperPath);
//       if (!(await fileExisted(realPath))) {
//         f2("壁纸文件不存在！");
//         return;
//       }
//     }

//     // 添加了switch相关
//     let zoomDef = "";
//     let switchDef = "";
//     let animationTemplate = "";
//     if (useZoomAni || useSwitchAni) {
//       animationTemplate += "animation:";
//       if (useZoomAni) {
//         // animationTemplate
//         {
//           animationTemplate += `zoom ${configObj.get<number>(
//             config_ids.ZOOM_CYCLE,
//             config_default.ZOOM_CYCLE
//           )}s infinite ease-in-out`;
//           if (useSwitchAni) {
//             animationTemplate += ",";
//           } else {
//             animationTemplate += ";";
//           }
//         }
//         // zoomDef
//         {
//           zoomDef = `@keyframes zoom{0%{background-size:100%;}50%{background-size:${configObj.get<number>(
//             config_ids.ZOOM_SCALE,
//             config_default.ZOOM_SCALE
//           )}%;}100%{background-size:100%;}}`;
//         }
//       }
//       if (useSwitchAni) {
//         {
//           if (useSwitchAni) {
//             const availablePapers = await getAvailablePapers();
//             const length = availablePapers.files.length;
//             // animationTemplate
//             {
//               let switchCycle = configObj.get<number>(
//                 config_ids.SWITCH_CYCLE,
//                 config_default.SWITCH_CYCLE
//               );
//               switchCycle = switchCycle * length;
//               animationTemplate += `switch ${switchCycle}s infinite steps(1);`;
//             }
//             // switchDef
//             {
//               // const prefix = `${loaderPrefix}/${
//               //   availablePapers.isInner ? "inner" : "user"
//               // }`;
//               const isInner = availablePapers.isInner;
//               const incre = Math.floor(100 / length);
//               let curStep = 0;
//               switchDef = "@keyframes switch{";
//               // 打乱
//               const shuffledFiles = shuffleArray(availablePapers.files);
//               for (const fileName of shuffledFiles) {
//                 switchDef += `${curStep}%{background-image:url(${getRelativeCSSPaperPath(
//                   { isInner, fileName }
//                 )});}`;
//                 curStep += incre;
//               }
//               switchDef += "}";

//               if (
//                 availablePapers.isInner &&
//                 context.globalState.get<boolean>(global_keys.TIP_INNER, true)
//               ) {
//                 vscode.window
//                   .showInformationMessage(
//                     "当前正在使用内置壁纸，点击左下角壁纸加载器，打开壁纸文件夹即可自定义壁纸哦！",
//                     "不再提示"
//                   )
//                   .then((res) => {
//                     if (res === "不再提示") {
//                       context.globalState.update(global_keys.TIP_INNER, false);
//                     }
//                   });
//               }
//             }
//           }
//         }
//       }
//     }
//     // switch下，body里面就不要写background-image了，而且有特定的switchTip标识
//     let mainContent = `@import url("${mainCSSOriName}");body{${
//       useSwitchAni ? "" : `background-image:url(${relativePaperPath});`
//     }background-repeat:no-repeat;background-position:center;background-size:cover;opacity:${configObj.get<number>(
//       config_ids.OPACITY,
//       config_default.OPACITY
//     )};${animationTemplate}}${zoomDef}${switchDef}`;

//     if (await fileWrite(mainCSSPath, mainContent).catch((err) => f2(err))) {
//       f1(true);
//     }
//   });
// }

// 读取Main的实体
type MainEntity = {
  useSwitch: boolean;
  paperInfo?: NonSwitchPaper;
};

type NonSwitchPaper = {
  isInner: boolean;
  file: string;
};

type SwitchPaper = {
  isInner: boolean;
  files: string[];
};

// 读取当前应用的壁纸
async function readCur() {
  if (curMainEntity) return curMainEntity;
  return await readMain();
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

  const infoMatch = content.match(/:url\(.*loader\/(.*?)\/(.*?)\)/);
  if (!infoMatch || infoMatch.length < 3) {
    return null;
  }

  return {
    useSwitch: false,
    paperInfo: {
      isInner: infoMatch[1] === "inner",
      file: infoMatch[2],
    },
  } as MainEntity;
}

function formatPath() {
  outPath = path.join(appRoot, "..", "..", "..");
  loaderDir = path.join(outPath, "loader");
  innerDir = path.join(loaderDir, "inner");
  userDir = path.join(loaderDir, "user");

  // loaderDir = path.join(workbenchPath, "loader");
  // innerDir = path.join(loaderDir, "inner");
  // userDir = path.join(loaderDir, "user");

  mainCSSPath = path.join(workbenchPath!, mainCSSName);
  mainCSSBakPath = `${mainCSSPath}-bak`;
  mainCSSOriPath = path.join(workbenchPath!, `${mainCSSOriName}`);
  // mainCSSRemovedPath = `${mainCSSPath}-removed`;
}

async function initInnerPapers() {
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

function getRelativeCSSPaperPath(paperInfo: NonSwitchPaper) {
  // return `loader/${paperInfo.isInner ? "inner" : "user"}/${paperInfo.fileName}`;
  return `../../../../../../loader/${paperInfo.isInner ? "inner" : "user"}/${
    paperInfo.file
  }`;
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

async function checkEnabledAndTip(tip?: string) {
  return new Promise((f1, f2) => {
    if (!isExtEnabled) {
      vscode.window
        .showInformationMessage(
          `${tip ? tip : "此操作只有在插件启用后才能执行，是否现在启用插件？"}`,
          "确定",
          "取消"
        )
        .then((res) => {
          if (res === "确定") {
            enable().then(() => {
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

function tipInner() {
  withThrottleByDay(
    () => {
      vscode.window
        .showInformationMessage(
          "当前正在使用内置壁纸，点击左下角壁纸加载器，打开壁纸文件夹即可自定义壁纸哦！",
          "不再提示"
        )
        .then((res) => {
          if (res === "不再提示") {
            context.globalState.update(global_keys.TIP_INNER, false);
          }
        });
    },
    context,
    "tipInner"
  )()
}

function isSwitchModel() {
  return getConfig<boolean>(config_ids.USE_SWITICH_ANIMATION);
}

function isExtEnabled() {
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

async function enable() {
  updateConfig(config_ids.ENABLED, true);
}

async function disable() {
  updateConfig(config_ids.ENABLED, false);
}

// 为了防止未知的异常，不要进行多余的IO操作
export async function onDisable() {
  console.log("插件被禁用，开始执行还原操作。。。");

  if (!workbenchPath) {
    const appRoot = vscode.env.appRoot;
    workbenchPath = path.join(appRoot, "out", "vs", "workbench");
    formatPath();
  }

  for (const key of context.globalState.keys()) {
    context.globalState.update(key, undefined);
  }

  // 设置init
  context.globalState.update(global_keys.INITTED, false);

  const res = await writeEmptyMain();

  // const data = await fileRead(mainCSSOriPath);

  // const res = await fileWrite(mainCSSPath, data).catch((err) =>
  //   vscode.window.showErrorMessage(err.toString())
  // );

  // if (!res) {
  //   return;
  // }

  await fileRemove(innerDir, { recursive: true, force: true });

  console.log("删除innerDir");
  // 用户目录不删除如果有用户的文件就不删除

  const files = await dirRead(userDir);
  if (files.length === 0) {
    await fileRemove(loaderDir, { recursive: true, force: true });
    console.log("删除loaderDir");
    vscode.window.showInformationMessage("壁纸加载器禁用成功，重启后生效。");
    return;
  } else {
    console.log("不删除userDir");
    vscode.window.showInformationMessage(
      `壁纸加载器禁用成功，重启后生效。载入的壁纸文件还保留在${userDir}中哦。`
    );
    return;
  }
}

// 插件禁用之后，移除之前所有的内置操作
// export async function onDisable() {
//   console.log("插件被禁用，开始执行还原操作。。。");

//   if (!workbenchPath) {
//     const appRoot = vscode.env.appRoot;
//     workbenchPath = path.join(appRoot, "out", "vs", "workbench");
//     formatPath();
//   }

//   const data = await fileRead(mainCSSOriPath);

//   const res = await fileWrite(mainCSSPath, data).catch((err) =>
//     vscode.window.showErrorMessage(err.toString())
//   );

//   if (!res) {
//     return;
//   }

//   for (const key of context.globalState.keys()) {
//     context.globalState.update(key, undefined);
//   }

//   await fileRename(mainCSSOriPath, mainCSSRemovedPath);

//   await fileRemove(innerDir, { recursive: true, force: true });

//   console.log("删除innerDir");
//   // 用户目录不删除如果有用户的文件就不删除

//   const files = await dirRead(userDir);

//   if (files.length === 0) {
//     await fileRemove(loaderDir, { recursive: true, force: true });
//     console.log("删除loaderDir");
//     vscode.window.showInformationMessage("壁纸加载器禁用成功，重启后生效。");
//     return;
//   } else {
//     console.log("不删除userDir");
//     vscode.window.showInformationMessage(
//       `壁纸加载器禁用成功，重启后生效。载入的壁纸文件还保留在${userDir}中哦。`
//     );
//     return;
//   }
// }

export function deactivate() {}

// vscode更新版本的时候，会刷掉workbench目录里面所有的文件
