import {
	$,
	$creator,
	$gm,
	$message,
	$modal,
	$store,
	Project,
	RenderScript,
	Script,
	StoreListenerType,
	el,
	request
} from '@ocsjs/core';
import gt from 'semver/functions/gt';
import { CommonProject } from './common';
import { definedProjects } from '..';

const state = {
	console: {
		listenerIds: {
			logs: 0 as StoreListenerType
		}
	},
	app: {
		listenerIds: {
			sync: 0 as StoreListenerType,
			connected: 0 as StoreListenerType,
			closeSync: 0 as StoreListenerType
		}
	}
};

export type LogType = 'log' | 'info' | 'debug' | 'warn' | 'error';

/** 后台进程，处理与PC软件端的通讯，以及其他后台操作 */
export const BackgroundProject = Project.create({
	name: '后台',
	domains: [],
	scripts: {
		console: new Script({
			name: '📄 日志输出',
			url: [['所有', /.*/]],
			namespace: 'render.console',
			configs: {
				logs: {
					defaultValue: [] as { type: LogType; content: string; time: number; stack: string }[]
				}
			},
			onrender({ panel }) {
				const getTypeDesc = (type: LogType) =>
					type === 'info'
						? '信息'
						: type === 'error'
						? '错误'
						: type === 'warn'
						? '警告'
						: type === 'debug'
						? '调试'
						: '日志';

				const createLog = (log: { type: LogType; content: string; time: number; stack: string }) => {
					const date = new Date(log.time);
					const item = el(
						'div',
						{
							title: '双击复制日志信息',
							className: 'item'
						},
						[
							el(
								'span',
								{ className: 'time' },
								`${date.getHours().toFixed(0).padStart(2, '0')}:${date.getMinutes().toFixed(0).padStart(2, '0')} `
							),
							el('span', { className: log.type }, `[${getTypeDesc(log.type)}]`),
							el('span', ':' + log.content)
						]
					);

					item.addEventListener('dblclick', () => {
						navigator.clipboard.writeText(
							Object.keys(log)
								.map((k) => `${k}: ${(log as any)[k]}`)
								.join('\n')
						);
					});

					return item;
				};

				const showLogs = () => {
					const div = el('div', { className: 'card console' });

					const logs = this.cfg.logs.map((log) => createLog(log));
					if (logs.length) {
						div.replaceChildren(...logs);
					} else {
						div.replaceChildren(
							el('div', '暂无任何日志', (div) => {
								div.style.textAlign = 'center';
							})
						);
					}

					return { div, logs };
				};

				/**
				 * 判断滚动条是否滚到底部
				 */
				const isScrollBottom = (div: HTMLElement) => {
					const { scrollHeight, scrollTop, clientHeight } = div;
					return scrollTop + clientHeight + 50 > scrollHeight;
				};

				const { div, logs } = showLogs();

				this.offConfigChange(state.console.listenerIds.logs);
				state.console.listenerIds.logs = this.onConfigChange('logs', (logs) => {
					const log = createLog(logs[logs.length - 1]);
					div.append(log);
					setTimeout(() => {
						if (isScrollBottom(div)) {
							log.scrollIntoView();
						}
					}, 10);
				});

				const show = () => {
					panel.body.replaceChildren(div);
					setTimeout(() => {
						logs[logs.length - 1]?.scrollIntoView();
					}, 10);
				};

				show();
			}
		}),
		appConfigSync: new Script({
			name: '🔄️ 软件配置同步',
			namespace: 'background.app',
			url: [['所有页面', /./]],
			// 如果是在OCS软件中则不显示此页面
			hideInPanel: $gm.getInfos() === undefined,
			configs: {
				notes: {
					defaultValue: $creator.notes([
						[
							el('span', [
								'如果您使用',
								el('a', { href: 'https://docs.ocsjs.com/docs/app', target: '_blank' }, 'OCS桌面软件'),
								'启动浏览器，并使用此脚本，'
							]),
							'我们会同步软件中的配置到此脚本上，方便多个浏览器的管理。',
							'窗口设置以及后台面板所有设置不会进行同步。'
						],
						'如果不是，您可以忽略此脚本。'
					]).outerHTML
				},
				sync: {
					defaultValue: false
				},
				connected: {
					defaultValue: false
				},
				closeSync: {
					defaultValue: false,
					label: '关闭同步',
					attrs: {
						type: 'checkbox'
					}
				}
			},

			onrender({ panel }) {
				// 同步面板不会被锁定
				panel.lockWrapper.remove();
				panel.configsContainer.classList.remove('lock');

				const update = () => {
					if (this.cfg.sync) {
						const tip = el('div', { className: 'notes card' }, [`已成功同步软件中的配置.`]);
						panel.body.replaceChildren(el('hr'), tip);
					} else if (this.cfg.connected) {
						const tip = el('div', { className: 'notes card' }, [`已成功连接到软件，但配置为空。`]);
						panel.body.replaceChildren(el('hr'), tip);
					}
				};
				update();

				this.offConfigChange(state.app.listenerIds.sync);
				this.offConfigChange(state.app.listenerIds.connected);
				this.offConfigChange(state.app.listenerIds.closeSync);
				state.app.listenerIds.sync = this.onConfigChange('sync', update);
				state.app.listenerIds.connected = this.onConfigChange('connected', update);
				state.app.listenerIds.closeSync = this.onConfigChange('closeSync', (closeSync) => {
					if (closeSync) {
						this.cfg.sync = false;
						this.cfg.connected = false;
						$message('success', { content: '已关闭同步，刷新页面后生效' });
					}
				});
			},
			async onactive() {
				if ($.isInTopWindow() && this.cfg.closeSync === false) {
					this.cfg.sync = false;
					try {
						const res = await request('http://localhost:15319/browser', {
							type: 'GM_xmlhttpRequest',
							method: 'get',
							responseType: 'json'
						});

						this.cfg.connected = true;

						if (res && Object.keys(res).length) {
							// 排除几个特殊的设置
							for (const key in res) {
								if (Object.prototype.hasOwnProperty.call(res, key)) {
									// 排除渲染脚本的设置
									if (RenderScript.namespace && key.startsWith(RenderScript.namespace)) {
										Reflect.deleteProperty(res, key);
									}
									// 排除后台脚本的设置
									for (const scriptKey in BackgroundProject.scripts) {
										if (Object.prototype.hasOwnProperty.call(BackgroundProject.scripts, scriptKey)) {
											const script: Script = Reflect.get(BackgroundProject.scripts, scriptKey);
											if (script.namespace && key.startsWith(script.namespace)) {
												Reflect.deleteProperty(res, key);
											}
										}
									}
								}
							}

							// 排除那些不用同步的配置
							for (const project of definedProjects()) {
								for (const key in project.scripts) {
									if (Object.prototype.hasOwnProperty.call(project.scripts, key)) {
										const script = project.scripts[key];
										for (const ck in script.configs) {
											if (Object.prototype.hasOwnProperty.call(script.configs, ck)) {
												if (script.configs[ck].extra?.appConfigSync === false) {
													Reflect.deleteProperty(res, $.namespaceKey(script.namespace, ck));
												}
											}
										}
									}
								}
							}

							// 同步所有的配置
							for (const key in res) {
								if (Object.prototype.hasOwnProperty.call(res, key)) {
									$store.set(key, res[key]);
								}
							}

							// 锁定面板
							for (const project of definedProjects()) {
								// 排除后台脚本的锁定
								if (project.name === BackgroundProject.name) {
									continue;
								}
								for (const key in project.scripts) {
									if (Object.prototype.hasOwnProperty.call(project.scripts, key)) {
										const script = project.scripts[key];
										const originalRender = script.onrender;
										// 重新定义渲染函数。在渲染后添加锁定面板的代码
										script.onrender = ({ panel, header }) => {
											originalRender?.({ panel, header });
											if (panel.configsContainer.children.length) {
												panel.configsContainer.classList.add('lock');
												panel.lockWrapper.style.width =
													(panel.configsContainer.clientWidth ?? panel.clientWidth) + 'px';
												panel.lockWrapper.style.height =
													(panel.configsContainer.clientHeight ?? panel.clientHeight) + 'px';
												panel.configsContainer.prepend(panel.lockWrapper);

												panel.lockWrapper.title =
													'🚫已同步OCS软件配置，如需修改请在软件设置中修改。或者前往 后台-软件配置同步 关闭配置同步。';
												panel.lockWrapper = $creator.tooltip(panel.lockWrapper);
											}
										};
										// 重新执行渲染
										if (script.panel && script.header) {
											script.onrender({ panel: script.panel, header: script.header });
										}
									}
								}
							}

							this.cfg.sync = true;
						}
					} catch (e) {
						console.error(e);
						this.cfg.sync = false;
						this.cfg.connected = false;
					}
				}
			}
		}),
		update: new Script({
			name: '📥 更新模块',
			url: [['所有页面', /.*/]],
			namespace: 'background.update',
			configs: {
				notes: {
					defaultValue: '脚本自动更新模块，如果有新的版本会自动通知。'
				},
				autoNotify: {
					defaultValue: true,
					label: '开启更新通知',
					attrs: { type: 'checkbox', title: '当有最新的版本时自动弹窗通知，默认开启' }
				},
				notToday: {
					defaultValue: -1
				},
				ignoreVersions: {
					defaultValue: [] as string[]
				}
			},
			methods() {
				return {
					getLastVersion: async () => {
						return (await request('https://cdn.ocsjs.com/ocs-version.json?t=' + Date.now(), {
							method: 'get',
							type: 'GM_xmlhttpRequest'
						})) as { 'last-version': string; resource: Record<string, string>; notes: string[] };
					}
				};
			},
			async onrender({ panel }) {
				const version = await this.methods.getLastVersion();
				const infos = $gm.getInfos();

				if (!infos) {
					return;
				}

				const changeLog = el('button', { className: 'base-style-button-secondary' }, '📄查看更新日志');
				changeLog.onclick = () => CommonProject.scripts.apps.methods.showChangelog();

				panel.body.replaceChildren(
					el('div', { className: 'card' }, [
						el('hr'),
						el('div', ['最新版本：' + version['last-version'] + ' - ', changeLog]),
						el('hr'),
						el('div', '当前版本：' + $gm.getInfos()?.script.version),
						el('div', '脚本管理器：' + infos?.scriptHandler),
						el('div', [
							'脚本更新链接：',
							el('a', { target: '_blank', href: version.resource[infos.scriptHandler] }, [
								version.resource[infos.scriptHandler]
							])
						])
					])
				);

				console.log('versions', {
					notToday: this.cfg.notToday,
					ignoreVersions: this.cfg.ignoreVersions,
					version: version
				});
			},
			oncomplete() {
				if (this.cfg.autoNotify && $.isInTopWindow()) {
					if (this.cfg.notToday === -1 || this.cfg.notToday !== new Date().getDate()) {
						const infos = $gm.getInfos();
						if (infos) {
							// 避免阻挡用户操作，这里等页面运行一段时间后再进行更新提示
							setTimeout(async () => {
								const version = await this.methods.getLastVersion();
								const last = version['last-version'];

								if (
									// 跳过主动忽略的版本
									this.cfg.ignoreVersions.includes(last) === false &&
									// 版本比较
									gt(last, infos.script.version)
								) {
									const modal = $modal('confirm', {
										maskCloseable: false,
										width: 600,
										content: $creator.notes([`检测到新版本发布 ${last} ：`, [...(version.notes || [])]]),
										footer: el('div', [
											el('button', { className: 'base-style-button-secondary', innerText: '跳过此版本' }, (btn) => {
												btn.onclick = () => {
													this.cfg.ignoreVersions = [...this.cfg.ignoreVersions, last];
													modal?.remove();
												};
											}),
											el('button', { className: 'base-style-button-secondary', innerText: '今日不再提示' }, (btn) => {
												btn.onclick = () => {
													this.cfg.notToday = new Date().getDate();
													modal?.remove();
												};
											}),
											el('button', { className: 'base-style-button', innerText: '前往更新' }, (btn) => {
												btn.onclick = () => {
													window.open(version.resource[infos.scriptHandler], '_blank');
													modal?.remove();
												};
											})
										])
									});
								}
							}, 5 * 1000);
						}
					}
				}
			}
		}),
		dev: new Script({
			name: '🛠️ 开发者调试',
			namespace: 'background.dev',
			url: [['所有页面', /./]],
			configs: {
				notes: {
					defaultValue: '开发人员调试用。<br>注入OCS_CONTEXT全局变量。用户可忽略此页面。'
				}
			},
			onrender({ panel }) {
				const injectBtn = el('button', { className: 'base-style-button' }, '点击注入全局变量');
				injectBtn.addEventListener('click', () => {
					$gm.unsafeWindow.OCS_CONTEXT = self;
				});
				panel.body.replaceChildren(el('div', { className: 'card' }, [injectBtn]));
			}
		}),
		appLoginHelper: new Script({
			name: '软件登录辅助',
			url: [
				['超星登录', 'passport2.chaoxing.com/login'],
				['智慧树登录', 'passport.zhihuishu.com/login'],
				['职教云登录', 'zjy2.icve.com.cn/portal/login.html'],
				['智慧职教登录', 'sso.icve.com.cn/sso/auth']
			],
			hideInPanel: true,
			oncomplete() {
				// 将面板移动至左侧顶部，防止挡住软件登录
				if ($.isInTopWindow()) {
					CommonProject.scripts.render.methods.moveToEdge();
				}
			}
		}),

		errorHandle: new Script({
			name: '全局错误捕获',
			url: [['', /.*/]],
			hideInPanel: true,
			onstart() {
				const projects = definedProjects();
				for (const project of projects) {
					for (const key in project.scripts) {
						if (Object.prototype.hasOwnProperty.call(project.scripts, key)) {
							const script = project.scripts[key];
							script.on('scripterror', (err) => {
								const msg = `[${project.name} - ${script.name}] : ${err}`;
								console.error(msg);
								$console.error(msg);
							});
						}
					}
				}
			}
		}),
		requestList: new Script({
			name: '📄 请求记录',
			url: [['', /.*/]],
			priority: 99,
			configs: {
				notes: {
					defaultValue: $creator.notes([
						'开发人员请求调试记录页面，小白勿入，最多只记录最近的100个请求数据',
						'可打开F12控制台查看请求日志，或者下方的请求列表'
					]).outerHTML
				},
				enable: {
					label: '开启请求记录',
					attrs: { type: 'checkbox' },
					defaultValue: false
				},
				methodFilter: {
					label: '方法过滤',
					tag: 'select',
					attrs: { placeholder: '选择选项' },
					options: [['none', '无'], ['GET'], ['POST'], ['OPTIONS'], ['HEAD']],
					defaultValue: 'none'
				},
				typeFilter: {
					label: '类型过滤',
					tag: 'select',
					attrs: { placeholder: '选择选项' },
					options: [
						['none', '无'],
						['gmxhr', '油猴API请求（gmxhr）'],
						['fetch', '普通请求（fetch）']
					],
					defaultValue: 'none'
				},
				searchValue: {
					label: '内容搜索',
					attrs: { placeholder: '搜索 URL/请求体/响应' },
					defaultValue: ''
				},
				list: {
					defaultValue: [] as {
						id: string;
						url: string;
						method: string;
						type: string;
						data: any;
						headers: any;
						response?: string;
						error?: string;
						time: number;
					}[]
				}
			},
			methods() {
				const render = (list: typeof this.cfg.list) => {
					this.panel?.body.replaceChildren();
					this.panel?.body.append(
						el('div', { className: 'card' }, [
							el('div', { style: { padding: '8px 0px', textAlign: 'end' } }, [
								el(
									'button',
									{
										className: 'base-style-button-secondary',
										style: { marginRight: '12px' },
										innerText: '🗑️清空记录'
									},
									(btn) => {
										btn.onclick = () => {
											this.cfg.list = [];
											render(this.cfg.list);
										};
									}
								),
								el('button', { className: 'base-style-button', innerText: '🔍执行搜索' }, (btn) => {
									btn.onclick = () => {
										if (
											this.cfg.methodFilter === 'none' &&
											this.cfg.typeFilter === 'none' &&
											this.cfg.searchValue === ''
										) {
											render(this.cfg.list);
										} else {
											const list = this.cfg.list
												.filter((item) => {
													if (
														this.cfg.methodFilter !== 'none' &&
														item.method.toLowerCase() !== this.cfg.methodFilter.toLowerCase()
													) {
														return false;
													}
													return true;
												})
												.filter((item) => {
													if (this.cfg.typeFilter !== 'none' && item.type !== this.cfg.typeFilter) {
														return false;
													}
													return true;
												})
												.filter((item) => {
													if (
														(this.cfg.searchValue && item.url.includes(this.cfg.searchValue)) ||
														item.data?.includes(this.cfg.searchValue) ||
														item.response?.includes(this.cfg.searchValue)
													) {
														return true;
													}

													return false;
												});
											render(list);
										}
									};
								})
							]),
							el(
								'div',
								{ style: { backgroundColor: '#292929', overflow: 'auto', maxHeight: window.innerHeight / 2 + 'px' } },
								[
									...(list.length === 0
										? [el('div', { style: { color: 'white', textAlign: 'center' } }, '暂无数据')]
										: []),
									...list.map((item) =>
										el(
											'div',
											{
												title: Object.entries(item)
													.map(([key, val]) =>
														key === 'time'
															? `${key} : ${new Date(val).toLocaleString().replace(/\//g, '-')}`
															: `${key} : ${val}`
													)
													.join('\n'),
												style: {
													maxWidth: '800px',
													padding: '4px 0px',
													margin: '4px 0px',
													// @ts-ignore
													textWrap: 'nowrap'
												}
											},
											[
												el('div', [
													el('span', { style: { marginRight: '8px' } }, new Date(item.time).toLocaleTimeString()),
													el(
														'span',
														{
															style: {
																backgroundColor: '#2196f3a3',
																color: '#ececec',
																marginRight: '8px',
																padding: '0px 2px'
															}
														},
														item.method
													),
													el(
														'span',
														{ style: { color: item.response ? '#4eb74e' : '#eb6262', marginRight: '8px' } },
														'●'
													),
													el(
														'div',
														{ style: { display: 'inline-block', color: '#ececec' } },
														item.url ? (item.url.length > 100 ? item.url.slice(0, 100) + '...' : item.url) : '-'
													)
												]),
												el(
													'div',
													{ style: { overflow: 'hidden', fontSize: '12px', color: '#8f8f8f' } },
													item.data ? 'data: ' + item.data : ''
												),
												el(
													'div',
													{ style: { overflow: 'hidden', fontSize: '12px', color: '#8f8f8f' } },
													item.response ? 'resp: ' + item.response : item.error ? 'err : ' + item.error : ''
												)
											]
										)
									)
								]
							)
						])
					);
				};
				return {
					render: render
				};
			},
			onrender() {
				this.methods.render(this.cfg.list);
			},
			onstart() {
				/* global GM_xmlhttpRequest  RequestInfo RequestInit */
				/* eslint-disable no-global-assign */
				const gmRequest = GM_xmlhttpRequest;
				const originalFetch = fetch;

				const getId = () => Math.random().toString(16).slice(2);

				const addRecord = (item: typeof this.cfg.list[number]) => {
					this.cfg.list = [item, ...this.cfg.list];
					if (this.cfg.list.length > 100) {
						this.cfg.list = this.cfg.list.slice(0, 100);
					}
				};

				const setItem = (id: string, response: string | undefined, error: string | undefined) => {
					const list: typeof this.cfg.list = JSON.parse(JSON.stringify(this.cfg.list));
					const index = list.findIndex((item) => item.id === id);
					if (index !== -1) {
						list[index].response = response;
						list[index].error = error;
					}
					this.cfg.list = list;
				};

				// @ts-ignore
				GM_xmlhttpRequest = (details: any) => {
					if (this.cfg.enable) {
						const id = getId();
						const data = {
							id: id,
							url: details.url,
							method: details.method || 'unknown',
							type: 'gmxhr',
							data: details.data,
							headers: details.headers,
							response: '',
							error: '',
							time: Date.now()
						};
						addRecord(data);
						const onload = details.onload;
						const onerror = details.onerror;

						details.onload = function (response: any) {
							setItem(id, response.responseText, '');
							data.response = details.responseType === 'json' ? response.response : response.responseText;
							console.log('%c [请求成功]', 'color: green; font-weight: bold', data.url, data);
							onload?.apply(this, [response]);
						};
						details.onerror = function (response: any) {
							setItem(id, '', response.error);
							data.error = response.error;
							console.log('%c [请求失败]', 'color: red; font-weight: bold', data.url, data);
							onerror?.apply(this, [response]);
						};
					}

					return gmRequest.apply(this, [details as any]);
				};
				// @ts-ignore
				fetch = (input: URL | RequestInfo, init?: RequestInit | undefined) => {
					if (this.cfg.enable) {
						const id = getId();
						const data = {
							id: id,
							url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
							method: init?.method || 'unknown',
							type: 'fetch',
							data: init?.body,
							headers: init?.headers,
							response: '',
							error: '',
							time: Date.now()
						};
						addRecord(data);
						const res = originalFetch.apply(this, [input, init]);
						res
							.then((result) => result.text())
							.then((result) => {
								setItem(id, result, '');
								data.response = result;
								console.log('%c [请求成功]', 'color: green; font-weight: bold', data.url, data);
							});

						res.catch((err) => {
							setItem(id, '', String(err));
							data.error = String(err);
							console.log('%c [请求失败]', 'color: red; font-weight: bold', data.url, data);
						});
						return res;
					} else {
						return originalFetch.apply(this, [input, init]);
					}
				};
			}
		})
	}
});

type Console = Record<LogType, (...msg: any[]) => void>;

/** 日志对象，存储日志并显示在日志面板 */
export const $console: Console = new Proxy({} as Console, {
	get(target, key) {
		return (...msg: any[]) => {
			let logs = BackgroundProject.scripts.console.cfg.logs;
			if (logs.length > 50) {
				logs = logs.slice(-50);
			}
			logs = logs.concat({
				type: key.toString() as LogType,
				content: msg.join(' '),
				time: Date.now(),
				stack: (Error().stack || '').replace('Error', '')
			});

			BackgroundProject.scripts.console.cfg.logs = logs;
		};
	}
});
