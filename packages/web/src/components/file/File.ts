import { LaunchScriptsOptions } from "@ocsjs/scripts";
import { Modal } from "ant-design-vue";
import { h } from "vue";
import { config } from "../../config";
import { jsonLint } from "../../utils";
import Description from "../Description.vue";
import { Project } from "../project";
const fs = require("fs") as typeof import("fs");
const fsExtra = require("fs-extra") as typeof import("fs-extra");
const path = require("path") as typeof import("path");

export { fs, fsExtra, path };

/** 文件节点状态 */
export interface FileStats {
    createTime: number;
    modifyTime: number;
    /** 是否为文件夹 */
    isDirectory: boolean;
    /** 是否显示 */
    show: boolean;
    /** 是否正在打开编辑 */
    opened: boolean;
    /** 是否运行中 */
    running: boolean;
}

/**
 * 文件节点
 */
export interface FileNode {
    /** 文件名 */
    title: string;
    uid: string;
    content: string;

    slots: {
        icon: string;
    };
    /** 文件信息 */
    stat: FileStats;
    /** 文件路径 */
    path: string;
    /** 父目录 */
    parent: string;
    /** 子文件 */
    children?: FileNode[];
}

/**
 * 获取可用文件名
 * @param rootPath 父目录
 * @param name 名字模板, 例如 新建文件夹($count) , $count - 序号占位符
 */
export function validFileName(rootPath: string, name: string) {
    if (!name.includes("$count")) throw "名字模板未带有序号占位符 - $count";
    let count = 0;
    let p = "";
    while (true) {
        p = path.resolve(rootPath, name.replace("($count)", count++ === 0 ? "" : `(${count})`));
        if (!fs.existsSync(p)) {
            break;
        }
    }
    return p;
}

/**
 * 提供文件遍历操作
 * @param files 文件源
 * @param handlers 处理器
 */
export function loopFiles(files: FileNode[], ...handlers: { (files: FileNode[]): FileNode[] }[]) {
    for (const handler of handlers) {
        files = handler(files);
    }

    for (const file of files) {
        if (file.children) {
            for (const handler of handlers) {
                file.children = handler(file.children);
            }
            loopFiles(file.children, ...handlers);
        }
    }

    return files;
}

/**
 * 扁平化目录结构
 * @param files 文件源
 */
export function flatFiles(files: FileNode[]): FileNode[] {
    let _files: FileNode[] = Array.from(JSON.parse(JSON.stringify(files)));
    let flat = [] as FileNode[];
    while (_files.length !== 0) {
        const file = _files.shift();
        if (file) {
            if (file.children) {
                _files = _files.concat(file.children);
            }
            flat.push(file);
        }
    }

    return flat;
}

/**
 * 在 parent 下创建文件
 * @param parent
 */
export function createFile(parent: FileNode) {
    const newFilePath = validFileName(parent.path, "新建OCS文件($count).ocs");
    Project.renamingFilePath.value = newFilePath;
    fs.writeFileSync(newFilePath, config.ocsFileTemplate(parent.uid));
}

/**
 * 在 parent 下创建文件夹
 * @param parent
 */
export function mkdir(parent: FileNode) {
    const newDirPath = validFileName(parent.path, "新建文件夹($count)");
    Project.renamingFilePath.value = newDirPath;
    fs.mkdirSync(newDirPath);
}

/**
 * 显示详情属性
 * @param file 文件节点
 */
export function detail(file: FileNode) {
    Modal.info({
        title: () => "文件属性",
        mask: false,
        closable: true,
        maskClosable: true,
        okText: "确定",
        width: 500,
        content: () =>
            h("div", {}, [
                desc("uid", file.uid),
                desc("文件名", file.title),
                desc("位置", file.path),
                desc("创建时间", new Date(file.stat.createTime).toLocaleString()),
                desc("最近修改", new Date(file.stat.modifyTime).toLocaleString()),
            ]),
    });

    function desc(label: string, desc: string) {
        return h(Description, { label, desc });
    }
}

/**
 * 检验文件格式
 */
export function validFileContent(content: string) {
    const result = jsonLint(content);

    if (result) {
        return {
            error: {
                message: `Unexpected token ${result.token} in JSON at line ` + result.line,
                line: result.line,
            },
        };
    } else {
        return content;
    }
}

export function showFile(file: FileNode) {
    /** 隐藏所有文件，显示当前点击的文件 */
    Project.opened.value.forEach((file) => (file.stat.show = false));

    /** 寻找打开过的文件 */
    const openedFile = Project.opened.value.find((f) => f.uid === file.uid);
    /** 如果该文件之前打开过 */
    if (openedFile) {
        openedFile.stat.show = true;
    } else {
        /** 新增文件编辑 */
        file.stat.show = true;
        Project.opened.value.push(file);
    }
}
