# 壁纸加载器 WallpaperLoader

这是一个为vscode加载壁纸的插件，支持壁纸管理和壁纸自动加载以及简单壁纸动画等功能。

<!-- Guide for this sample: https://code.visualstudio.com/api/get-started/your-first-extension. -->

# 使用说明

安装插件后，在左下方状态栏可以看到 "壁纸加载器" 按钮，点击后看到以下选项：

- 自定义壁纸

用于打开用户壁纸文件夹，将壁纸文件复制进去（支持传统的jpg、png、甚至gif等图片类型）。

注意：不要在里面放无关的东西，如文本文件和文件夹，如果被加载到这些东西，壁纸会显示不出来。

如果不自定义，将会使用内置壁纸

- 刷新壁纸

直接刷新壁纸，会自动刷新vscode

- 打开壁纸视图

可视化壁纸管理，可以启用、禁用、删除壁纸

双击以启用，右键有菜单提示

- 打开加载器配置

打开壁纸加载器的用户设置，内附有配置说明，不合规的改动一般不会成功。如果配置过后出现明显的bug，请联系作者，非常感谢您的反馈！

- 禁用/启用壁纸加载器

### 重点！！！

如果不再想使用本壁纸加载器，请先禁用掉壁纸加载器，待壁纸不见了，再从插件库中删除此插件，否则壁纸会一直存在。原因是：插件的原理是修改了vscode内置文件，并且目前作者没有找到当插件被直接删除时可以进行的后置处理操作。



## Demo



## VS Code API

### `vscode` module

- [`commands.registerCommand`](https://code.visualstudio.com/api/references/vscode-api#commands.registerCommand)
- [`window.showInformationMessage`](https://code.visualstudio.com/api/references/vscode-api#window.showInformationMessage)

### Contribution Points

- [`contributes.commands`](https://code.visualstudio.com/api/references/contribution-points#contributes.commands)

