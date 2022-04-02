// @ts-check

const { app, BrowserWindow } = require("electron");
const { handleOpenFile } = require("./src/tasks/handle.file.open");
const { remoteRegister } = require("./src/tasks/remote.register");
const { initStore } = require("./src/tasks/init.store");
const { autoLaunch } = require("./src/tasks/auto.launch");
const { createWindow } = require("./src/main");
const { globalListenerRegister } = require("./src/tasks/global.listener");
const { task } = require("./src/utils");
const { handleError } = require("./src/tasks/error.handler");
const { updater } = require("./src/tasks/updater");

/** 获取单进程锁 */
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    bootstrap();
}

/** 启动渲染进程 */
function bootstrap() {
    task("OCS启动程序", () =>
        Promise.all([
            task("初始化错误处理", () => handleError()),
            task("初始化本地设置", () => initStore()),
            task("初始化自动启动", () => autoLaunch()),
            task("处理打开文件", () => handleOpenFile(process.argv)),

            task("启动渲染进程", async () => {
                await app.whenReady();
                /** @type {BrowserWindow | undefined} */
                let window = createWindow();

                task("初始化远程通信模块", () => remoteRegister(window));
                task("注册app事件监听器", () => globalListenerRegister(window));

                if (app.isPackaged) {
                    task("软件更新", () => updater(window));
                    await window.loadFile("public/index.html");
                } else {
                    await window.loadURL("http://localhost:3000");
                }

                window.show();

                window.webContents.openDevTools();
            }),
        ])
    );
}
