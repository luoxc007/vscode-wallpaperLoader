(function () {
  let selectedPath = null;
  const vscode = acquireVsCodeApi();
  const wallpaperItems = document.querySelectorAll(".wallpaper-item");
  const contextMenu = document.getElementById("context-menu");
  const contextMenuBanned = document.getElementById("context-menu-banned");

  wallpaperItems.forEach((item) => {
    // 单击改双击
    // 双击事件
    let clickCount = 0;
    let timeout;
    item.addEventListener("click", (event) => {
      allContextMenuConceal();
      // Webview中只能接收左键的click，也就是event.button只可能是0
      //   if (event.button === 2) {
      //     // 右键
      //     vscode.postMessage({
      //         type: "msg",
      //         payload: "右键点击了",
      //       });
      //     event.preventDefault();
      //     contextMenu.style.left = event.clientX + "px";
      //     contextMenu.style.top = event.clientY + "px";
      //     contextMenu.style.display = "block";
      //     selectedPath = item.dataset.path;
      //     return;
      //   }
      clickCount++;
      if (clickCount === 1) {
        timeout = setTimeout(function () {
          // 单击事件的处理逻辑
          clickCount = 0;
        }, 300); // 设置单击事件的延迟时间，单位为毫秒
      } else if (clickCount === 2) {
        clearTimeout(timeout);
        // 双击事件的处理逻辑
        vscode.postMessage({
          type: "bgSelected",
          payload: item.dataset.path,
        });
        clickCount = 0;
      }
    });
  });
  document.addEventListener("click", (event) => {
    allContextMenuConceal();
  });

  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();

    if (event.target instanceof HTMLImageElement) {
      if (event.target.dataset.removed) {
        contextMenuBanned.style.display = "block";
        contextMenuBanned.style.left = `${parseInt(event.clientX) - 10}px`;
        contextMenuBanned.style.top = `${event.clientY}px`;
        selectedPath = event.target.dataset.path;
      } else {
        contextMenu.style.display = "block";
        contextMenu.style.left = `${parseInt(event.clientX) - 10}px`;
        contextMenu.style.top = `${event.clientY}px`;
        selectedPath = event.target.dataset.path;
      }
    } else {
    }
  });
  contextMenu.addEventListener("click", (event) => {
    if (event.target.id === "select") {
      if (selectedPath !== null) {
        vscode.postMessage({
          type: "bgSelected",
          payload: selectedPath,
        });
      }
    } else if (event.target.id === "ban") {
      if (selectedPath !== null) {
        vscode.postMessage({
          type: "bgBanned",
          payload: selectedPath,
        });
      }
    }
    allContextMenuConceal();
  });

  contextMenuBanned.addEventListener("click", (event) => {
    if (event.target.id === "startup") {
      vscode.postMessage({
        type: "bgStartup",
        payload: selectedPath,
      });
    } else if (event.target.id === "remove") {
      vscode.postMessage({
        type: "bgRemoved",
        payload: selectedPath,
      });
    } else {
      vscode.postMessage({
        type: "msg",
        payload: "啥也没有",
      });
    }
    allContextMenuConceal();
  });

  function allContextMenuConceal() {
    contextMenu.style.display = "none";
    contextMenuBanned.style.display = "none";
    selectedPath = null;
  }
})();
//# sourceMappingURL=main.js.map
