import path = require("path");

const PLUGIN_NAME = "wallpaper-loader";
const PLUGIN_CN_NAME = "壁纸加载器";
const MEDIA_DIR = path.join(__filename, "..", "..", "media");

const global_keys = {
  STYLE_UPDATE: "style-update",
  REMOVE_USED: "remove-used",
  INITTED: "initted",
  TIP_INNER:"tip-inner"
};

const config_ids = {
  ENABLED: "root.enabled",
  AUTO_REFRESH: "root.auto-refresh",
  USE_REMOVE: "profile.use-remove",
  USE_ZOOM_ANIMATION: "style.animation.use-zoom-animation",
  OPACITY: "style.opacity",
  ZOOM_CYCLE: "style.animation.zoom-cycle",
  ZOOM_SCALE: "style.animation.zoom-scale",
  USE_SWITICH_ANIMATION: "style.animation.use-switch-animation",
  SWITCH_CYCLE: "style.animation.switch-cycle",
};

const command_ids = {
  DISABLE_EXT: "wallpapaerLoader.disableExt",
  ENABLE_EXT: "wallpapaerLoader.enableExt",
  CONFIG_LOADER: "wallpapaerLoader.config",
  REFRESH_PAPER: "wallpapaerLoader.refreshPaper",
  OPEN_USER_DIR: "wallpapaerLoader.openUserDir",
  ON_USER_DIR_UPDATE:"wallpaperLoader.onUserDirUpdate"
};

const config_default = {
  OPACITY: 0.9,
  ZOOM_CYCLE: 60,
  ZOOM_SCALE: 120,
  SWITCH_CYCLE: 20,
};

export {
  PLUGIN_NAME,
  PLUGIN_CN_NAME,
  MEDIA_DIR,
  config_ids,
  global_keys,
  command_ids,
  config_default,
};
