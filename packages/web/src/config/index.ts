import { reactive, shallowRef } from "vue";
import { RouteRecordRaw } from "vue-router";
import setting from "@/pages/setting/index.vue";
import workspace from "@/pages/workspace/index.vue";
import { LaunchScriptsOptions } from "@ocsjs/scripts";
import { path } from "../components/file/File";
import { store } from "../store";

const { randomUUID } = require("crypto") as typeof import("crypto");

export const config = reactive({
    /** 标题设置 */
    title: {
        style: {
            backgroundColor: "#fff",
        },
    },
    /**
     * 状态存储
     */
    status: {},
    /**
     * 路由设置
     *
     * why use shallowRef:
     *
     * Vue received a Component which was made a reactive object. This can lead to unnecessary performance overhead,
     * and should be avoided by marking the component with `markRaw` or using `shallowRef` instead of `ref`.
     */
    routes: {
        workspace: {
            name: "workspace",
            path: "/",
            component: shallowRef(workspace),
            meta: {
                title: "工作区",
            },
        },
        setting: {
            name: "setting",
            path: "/setting",
            component: shallowRef(setting),
            meta: {
                title: "设置",
            },
        },
    } as Record<any, RouteRecordRaw>,
    /**
     * 初始文件模板
     */
    ocsFileTemplate: (uid?: string) => {
        uid = uid || randomUUID().replace(/-/g, "");

        return JSON.stringify(
            {
                uid,
                launchOptions: {
                    headless: false,
                    executablePath: "default",
                },
                scripts: [
                    {
                        name: "cx-login-phone",
                        options: {},
                    },
                ],
                userDataDir: path.join(store["user-data-path"], "scriptUserData", uid),
                init: true,
                localStorage: "default",
            } as LaunchScriptsOptions,
            null,
            4
        );
    },
});
