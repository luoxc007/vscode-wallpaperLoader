(function () {
  let selectedPath = null;
  const vscode = acquireVsCodeApi();
  const wallpaperItems = document.querySelectorAll(".usable");
  const contextMenu = document.getElementById("context-menu");
  const contextMenuBanned = document.getElementById("context-menu-banned");

  wallpaperItems.forEach((item) => {
    // 单击改双击
    // 双击事件
    let clickCount = 0;
    let timeout;
    item.addEventListener("click", (event) => {
      allContextMenuConceal();
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
          type: "selected",
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
          type: "selected",
          payload: selectedPath,
        });
      }
    } else if (event.target.id === "ban") {
      if (selectedPath !== null) {
        vscode.postMessage({
          type: "banned",
          payload: selectedPath,
        });
      }
    }
    allContextMenuConceal();
  });

  contextMenuBanned.addEventListener("click", (event) => {
    if (event.target.id === "startup") {
      vscode.postMessage({
        type: "startup",
        payload: selectedPath,
      });
    } else if (event.target.id === "remove") {
      vscode.postMessage({
        type: "removed",
        payload: selectedPath,
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
