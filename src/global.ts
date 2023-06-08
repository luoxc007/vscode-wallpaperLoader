import path = require("path");

const PLUGIN_NAME = "bg-loader";
const PLUGIN_CN_NAME = "壁纸加载器";
const MEDIA_DIR = path.join(__filename, "..", "..", "media");

const global_keys = {
  STYLE_UPDATE: "style-update",
  // IS_INNER: "isInner",
  // BG_NAME: "bgName",
  REMOVE_USED: "remove-used",
};

const config_ids = {
  ENABLED: "root.enabled",
  AUTO_REFRESH: "root.auto-refresh",
  USE_REMOVE: "profile.use-remove",
  USE_ZOOM_ANIMATION: "style.animation.use-zoom-animation",
  OPACITY: "style.opacity",
  ZOOM_CIRCLE: "style.animation.zoom-circle",
  ZOOM_SCALE: "style.animation.zoom-scale",
  USE_SWITICH_ANIMATION: "style.animation.use-switch-animation",
  SWITCH_CIRCLE: "style.animation.switch-circle",
};

const command_ids = {
  DISABLE_EXT: "BGLoader.disableExt",
  ENABLE_EXT: "BGLoader.enableExt",
  REFRESH_BG: "BGLoader.refreshBG",
  FIX_BG: "BGLoader.fixBG",
  AUTO_REFRESH_BG: "BGLoader.autoRefreshBG",
  OPEN_USER_DIR: "BGLoader.openUserDir",
  Config_BG_LOADER: "BGLoader.configBGLoader",
};

const config_default = {
  OPACITY: 0.9,
  ZOOM_CIRCLE: 60,
  ZOOM_SCALE: 120,
  SWITCH_CIECLE: 60,
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
