# 壁纸加载器 WallpaperLoader

#### 简介

这是一个为vscode加载壁纸的插件，支持壁纸管理和壁纸自动加载以及简单壁纸动画等功能。



#### 插件下载

在vscode插件商店搜索"wallpaperloader"即可下载使用，作者为luoxc007。

插件源码地址为:https://github.com/luoxc007/vscode-wallpaperLoader



#### 使用说明

安装插件后，在左下方状态栏可以看到 "壁纸加载器" 按钮，点击后看到以下选项：

![打开自定义目录](https://raw.githubusercontent.com/luoxc007/vscode-wallpaperLoader/main/media/md_img/open_config.jpg)

- 自定义壁纸

用于打开用户壁纸文件夹，将壁纸文件复制进去（支持传统的jpg、png、甚至gif等图片类型）。

注意：不要在里面放无关的东西，如文本文件和文件夹，如果被加载到这些东西，壁纸会显示不出来。

如果不自定义，将会使用内置壁纸。打开壁纸文件夹，放入喜欢的壁纸图片，这些图片就会被自动加载。

![自定义壁纸](https://raw.githubusercontent.com/luoxc007/vscode-wallpaperLoader/main/media/md_img/user_dir.jpg)

- 刷新壁纸

直接刷新壁纸，会自动刷新vscode

- 打开壁纸视图

可视化壁纸管理，可以启用、禁用、删除壁纸

双击以启用，右键有菜单提示

![打开壁纸视图](https://raw.githubusercontent.com/luoxc007/vscode-wallpaperLoader/main/media/md_img/view_manager.jpg)

- 打开加载器配置

打开壁纸加载器的用户设置，内附有配置说明，不合规的改动一般不会成功。如果配置过后出现明显的bug，请联系作者，非常感谢您的反馈！

![打开加载器配置](https://raw.githubusercontent.com/luoxc007/vscode-wallpaperLoader/main/media/md_img/settings.jpg)

特别说明：动画效果默认开启，如有不适可在配置处关闭

- 禁用/启用壁纸加载器

### 卸载须知（重点！！！）

如果不再想使用本壁纸加载器，请先禁用掉壁纸加载器，待壁纸不见了，再从插件库中删除此插件，否则壁纸会一直存在。原因是：插件的原理是修改了vscode内置文件



### 其他问题

若vscode出现黄色提示，说要重新安装，是正常现象，可不予理会。



### 联系作者

邮箱地址：buptfhxy@163.com



## VS Code API

### `vscode` module

- [`commands.registerCommand`](https://code.visualstudio.com/api/references/vscode-api#commands.registerCommand)
- [`window.showInformationMessage`](https://code.visualstudio.com/api/references/vscode-api#window.showInformationMessage)

### Contribution Points

- [`contributes.commands`](https://code.visualstudio.com/api/references/contribution-points#contributes.commands)

