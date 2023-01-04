import { defaultAnswerWrapperHandler } from '../core/worker/answer.wrapper.handler';
import { OCSWorker } from '../core/worker/worker';
import { ConfigElement } from '../elements/config';
import { MessageElement } from '../elements/message';
import { Config } from '../interfaces/config';
import { Project } from '../interfaces/project';
import { Script } from '../interfaces/script';
import { $ } from '../utils/common';
import { $creator, CommonWorkOptions } from '../utils/creator';
import { $$el, $el, el } from '../utils/dom';
import { StringUtils } from '../utils/string';
import { $gm } from '../utils/tampermonkey';
import { $message, $model } from './render';
import { CommonProject } from './common';
import { WorkResult, WorkUploadType } from '../core/worker/interface';
import { $script } from '../utils/script';

/**
 * 全局变量
 */

const volume: Config = {
	label: '音量调节',
	attrs: { type: 'range', step: '0.05', min: '0', max: '1' },
	defaultValue: 0,
	onload() {
		this.addEventListener('change', () => {
			this.setAttribute('data-title', (parseFloat(this.getAttribute('value') || '0') * 100).toFixed() + '%');
		});
		this.setAttribute('data-title', (parseFloat(this.getAttribute('value') || '0') * 100).toFixed() + '%');
	}
};
const restudy: Config = {
	label: '复习模式',
	attrs: { title: '已经完成的视频继续学习', type: 'checkbox' },
	defaultValue: false
};

const definition: Config = {
	label: '清晰度',
	tag: 'select',
	defaultValue: 'line1bq',
	onload() {
		this.append(
			...$creator.selectOptions(this.getAttribute('value'), [
				['line1bq', '流畅'],
				['line1gq', '高清']
			])
		);
	}
};

const workConfigs = {
	notes: {
		defaultValue: $creator.notes([
			'答题前请在 “通用-全局设置” 中设置题库配置，才能开始自动答题。',
			'可以搭配 “通用-在线搜题” 一起使用。'
		]).outerHTML
	} as Config<any, string>,
	auto: {
		label: '开启自动答题',
		attrs: { type: 'checkbox' },
		defaultValue: false
	} as Config<any, boolean>,

	upload: {
		label: '答题完成后',
		tag: 'select',
		defaultValue: 'save' as WorkUploadType,
		attrs: { title: '答题完成后的设置, 鼠标悬浮在选项上可以查看每个选项的具体解释。' },
		onload() {
			this.append(
				...$creator.selectOptions(this.getAttribute('value'), [
					['save', '自动保存', '完成后自动保存答案, 注意如果你开启了随机作答, 有可能分辨不出答案是否正确。'],
					['nomove', '不保存也不提交', '等待时间过后将会自动下一节, 适合在测试脚本时使用。'],
					...([10, 20, 30, 40, 50, 60, 70, 80, 90].map((rate) => [
						rate.toString(),
						`搜到${rate}%的题目则自动提交`,
						`例如: 100题中查询到 ${rate} 题的答案,（答案不一定正确）, 则会自动提交。`
					]) as [any, string, string][]),
					['100', '每个题目都查到答案才自动提交', '答案不一定正确'],
					['force', '强制自动提交', '不管答案是否正确直接强制自动提交，如需开启，请配合随机作答谨慎使用。']
				])
			);
		}
	} as Config<any, WorkUploadType>
};

// 是否暂停
let stop = false;
// 是否存在验证码
const hasCapture = false;

/** 工程导出 */
export const ZHSProject = Project.create({
	name: '智慧树',
	level: 99,
	domains: ['zhihuishu.com'],
	scripts: {
		guide: new Script({
			name: '使用提示',
			url: [/onlineweb.zhihuishu.com\/onlinestuh5/, /www.zhihuishu.com/],
			level: 1,
			namespace: 'zhs.guide',
			configs: {
				notes: {
					defaultValue: $creator.notes([
						'请手动进入视频、作业、考试页面，脚本会自动运行。',
						'兴趣课会自动下一个，所以不提供脚本。',
						'校内学分课的考试脚本还未提供，请手动(划词)搜题。'
					]).outerHTML
				}
			}
		}),
		login: new Script({
			name: '登录脚本',
			url: [/passport.zhihuishu.com\/login/],
			level: 9,
			namespace: 'zhs.login',
			configs: {
				notes: {
					defaultValue: $creator.notes([
						'脚本会自动输入账号密码，但是需要手动填写验证码。',
						'脚本用于辅助软件登录，如不想使用可直接关闭。'
					]).outerHTML
				},
				disable: {
					label: '关闭此脚本',
					defaultValue: false,
					attrs: { type: 'checkbox' }
				},
				type: {
					label: '登录类型',
					tag: 'select',
					defaultValue: 'phone' as 'phone' | 'id',
					onload() {
						this.append(
							...$creator.selectOptions(this.getAttribute('value') || '', [
								['phone', '手机号登录'],
								['id', '学号登录']
							])
						);
					}
				}
			},
			onrender({ panel }) {
				let els: Record<string, ConfigElement<any>>;
				/** 监听更改 */
				this.onConfigChange('type', () => {
					for (const key in els) {
						if (Object.prototype.hasOwnProperty.call(els, key)) {
							els[key].remove();
						}
					}
					// 删除后重新渲染
					render();
				});

				const render = () => {
					/** 动态创建设置 */
					const passwordConfig: Config = { label: '密码', defaultValue: '', attrs: { type: 'password' } };
					if (this.cfg.type === 'phone') {
						els = $creator.configs('zhs.login', {
							phone: { label: '手机', defaultValue: '' },
							password: passwordConfig
						});
					} else {
						els = $creator.configs('zhs.login', {
							school: { label: '学校', defaultValue: '' },
							id: { label: '学号', defaultValue: '' },
							password: passwordConfig
						});
					}

					for (const key in els) {
						if (Object.prototype.hasOwnProperty.call(els, key)) {
							panel.configsBody.append(els[key]);
						}
					}
				};

				render();
			},
			oncomplete() {
				if (!this.cfg.disable) {
					const id = setTimeout(async () => {
						const phoneLogin = $el('#qSignin');
						const idLogin = $el('#qStudentID');

						const phone = $gm.getValue('zhs.login.phone');
						const password = $gm.getValue('zhs.login.password');
						const school = $gm.getValue('zhs.login.school');
						const id = $gm.getValue('zhs.login.id');

						if (this.cfg.type === 'phone') {
							if (phone && password) {
								phoneLogin.click();
								// 动态生成的 config 并不会记录在 this.cfg 中,但是仍然会按照 {namespace + key} 的形式保存在本地存储中，所以这里用 $gm.getValue 进行获取
								$el('#lUsername').value = $gm.getValue('zhs.login.phone');
								$el('#lPassword').value = $gm.getValue('zhs.login.password');
							} else {
								$message('warn', { content: '信息未填写完整，登录停止。' });
							}
						} else {
							if (school && id && password) {
								idLogin.click();
								const search = $el('#quickSearch');
								search.onfocus?.(new FocusEvent('focus'));
								search.value = $gm.getValue('zhs.login.school');
								search.onclick?.(new MouseEvent('click'));
								// 等待搜索
								await $.sleep(2000);

								$el('#schoolListCode > li').click();
								$el('#clCode').value = $gm.getValue('zhs.login.id');
								$el('#clPassword').value = $gm.getValue('zhs.login.password');
							} else {
								$message('warn', { content: '信息未填写完整，登录停止。' });
							}
						}

						// 点击登录
						await $.sleep(1000);
						$el('#f_sign_up .wall-sub-btn').click();
					}, 3000);
					const close = el('a', '取消');
					const msg = $message('info', { content: el('span', ['3秒后自动登录。', close]) });
					close.href = '#';
					close.onclick = () => {
						clearTimeout(id);
						msg.remove();
					};
				}
			}
		}),
		'gxk-study': new Script({
			name: '共享课学习脚本',
			url: [/studyvideoh5.zhihuishu.com/],
			level: 999,
			namespace: 'zhs.gxk.study',
			configs: {
				notes: {
					defaultValue: $creator.notes([
						'章节测试请大家观看完视频后手动打开。',
						[
							'请大家仔细打开视频上方的”学前必读“，查看成绩分布。',
							'如果 “平时成绩-学习习惯成绩” 占比多的话，就需要规律学习。',
							'每天定时半小时可获得一分习惯分。',
							'如果不想要习惯分可忽略。'
						]
					]).outerHTML
				},
				/** 学习记录 []  */
				studyRecord: {
					defaultValue: [] as {
						/** 学习日期 */
						date: number;
						courses: {
							/** 课程名 */
							name: string;
							/** 学习时间 */
							time: number;
						}[];
					}[]
				},
				stopTime: {
					label: '定时停止',
					tag: 'select',
					attrs: { title: '到时间后自动暂停脚本' },
					defaultValue: '0',
					onload() {
						this.append(
							...$creator.selectOptions(this.getAttribute('value'), [
								[0, '关闭'],
								[0.5, '半小时后'],
								[1, '一小时后'],
								[2, '两小时后']
							])
						);
					}
				},
				restudy: restudy,
				volume: volume,
				definition: definition,
				playbackRate: {
					label: '视频倍速',
					tag: 'select',
					defaultValue: 1,
					onload() {
						this.append(
							...$creator.selectOptions(
								this.getAttribute('value'),
								[1, 1.25, 1.5].map((rate) => [rate, rate + 'x'])
							)
						);
					}
				}
			},
			onrender({ panel }) {
				panel.body.append(
					el('hr'),
					$creator.button('⏰检测是否需要规律学习', {}, (btn) => {
						btn.style.marginRight = '12px';
						btn.onclick = () => {
							$el('.iconbaizhoumoshi-xueqianbidu').click();
							console.log($el('.preschool-Mustread-div'), $el('.preschool-Mustread-div').innerText);

							setTimeout(() => {
								const num = parseInt(
									$el('.preschool-Mustread-div').innerText.match(/学习习惯成绩（(\d+)分）/)?.[1] || '0'
								);
								$model('alert', {
									content:
										`当前课程习惯分占比为${num}分，` +
										(num
											? `需要规律学习${num}天, 每天定时观看半小时即可。（如果不想拿习惯分可以忽略）`
											: '可一直观看学习，无需定时停止。')
								});
							}, 100);
						};
					}),
					$creator.button('📘查看学习记录', {}, (btn) => {
						btn.onclick = () => {
							$model('alert', {
								title: '学习记录',
								content: $creator.notes(
									this.cfg.studyRecord.map((r) => {
										const date = new Date(r.date);
										return [
											`${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date
												.getDate()
												.toString()
												.padStart(2, '0')}`,
											$creator.notes(r.courses.map((course) => `${course.name} - ${optimizeSecond(course.time)}`))
										];
									})
								)
							});
						};
					})
				);
			},
			onactive() {
				// 重置时间
				this.cfg.stopTime = '0';
				const records = this.cfg.studyRecord;
				// 查找是否存在学习记录，不存在则新建
				const record = records.find(
					(record) => new Date(record.date).toLocaleDateString() === new Date().toLocaleDateString()
				);
				/** 初始化今日学习记录 */
				if (!record) {
					records.push({ date: Date.now(), courses: [] });
					this.cfg.studyRecord = records;
				}
			},
			oncomplete() {
				const vue = $el('.video-study')?.__vue__;
				let stopInterval: any = 0;
				let stopMessage: MessageElement;
				// 监听定时停止
				this.onConfigChange('stopTime', () => {
					clearInterval(stopInterval);
					stopMessage?.remove();
					if (this.cfg.stopTime === '0') {
						$message('info', { content: '定时停止已关闭' });
					} else {
						let stopCount = parseFloat(this.cfg.stopTime) * 60 * 60;
						stopInterval = setInterval(() => {
							if (stopCount > 0 && hasCapture === false) {
								stopCount--;
							} else {
								clearInterval(stopInterval);
								stop = true;
								$el<HTMLVideoElement>('video').pause();
								$model('alert', { content: '脚本暂停，已获得今日平时分，如需继续观看，请刷新页面。' });
							}
						}, 1000);
						const val = [
							[0.5, '半小时后'],
							[1, '一小时后'],
							[2, '两小时后']
						].find((t) => t[0].toString() === this.cfg.stopTime)?.[0] as number;
						const date = new Date();
						date.setMinutes(date.getMinutes() + val * 60);
						stopMessage = $message('info', {
							duration: 0,
							content: `在 ${date.toLocaleTimeString()} 脚本将自动暂停`
						});
					}
				});

				// 监听音量
				this.onConfigChange('volume', (curr) => {
					$el<HTMLVideoElement>('video').volume = curr;
				});

				// 监听速度
				this.onConfigChange('playbackRate', (curr) => {
					switchPlaybackRate(parseFloat(curr.toString()));
				});

				// 监听清晰度
				this.onConfigChange('definition', (curr) => {
					switchLine(curr);
				});

				const hideDialog = () => {
					/** 隐藏通知弹窗 */
					$$el('.el-dialog__wrapper').forEach((dialog) => {
						dialog.remove();
					});
				};
				/** 关闭测验弹窗 */
				const closeTestDialog = async () => {
					const items = $$el('.topic-item');
					if (items.length !== 0) {
						// 选择A
						items[0].click();
						await $.sleep(1000);
						// 关闭弹窗
						vue.testDialog = false;
					}
				};

				const finish = () => {
					$model('alert', {
						content: '检测到当前视频全部播放完毕，如果还有未完成的视频请刷新重试，或者打开复习模式。'
					});
				};
				/** 固定视频进度 */
				const fixProcessBar = () => {
					const bar = $el('.controlsBar');
					bar.style.display = 'block';
				};

				let timeMessage: MessageElement;
				const calculateTime = () => {
					// 计算视频完成所需时间
					try {
						const vue = $el('.video-study')?.__vue__;
						const videos = (vue.videoList as any[])
							.map((v: any) => v.videoLessons)
							.flat()
							.map((l: any) => /** 章节或者章节中的小节 */ l?.videoSmallLessons || l)
							.flat()
							/** 排除已经学习过的 */
							.filter((v) => v.isStudiedLesson === 0);
						const allTime: number = videos.map((l) => l.videoSec || 0).reduce((pre, curr) => pre + curr, 0);
						if (timeMessage) {
							timeMessage.remove();
						}

						const record = this.cfg.studyRecord.find(
							(r) => new Date(r.date).toLocaleDateString() === new Date().toLocaleDateString()
						);
						timeMessage = $message('info', {
							duration: 0,
							content: `还剩${videos.length - 1}个视频，总时长${(allTime / (60 * 60)).toFixed(
								2
							)}小时，今日已学习${optimizeSecond(
								record?.courses.find((c) => c.name === vue.data.courseInfo.name)?.time || 0
							)}`
						});
					} catch {}
				};

				const interval = setInterval(async () => {
					// 等待视频加载完成
					if (vue.videoList.length) {
						clearInterval(interval);
						hack();
						hideDialog();
						setInterval(() => {
							closeTestDialog();
							fixProcessBar();
							// 删除遮罩层
							$$el('.v-modal,.mask').forEach((modal) => {
								modal.remove();
							});

							// 记录学习时间
							if (!stop) {
								const records = this.cfg.studyRecord;
								const record = records.find(
									(r) => new Date(r.date).toLocaleDateString() === new Date().toLocaleDateString()
								);
								if (record) {
									record.courses = record?.courses || [];
									const course = record?.courses.find((c) => c.name === vue.data.courseInfo.name);
									if (course) {
										course.time = course.time + 3;
									} else {
										record.courses.push({ name: vue.data.courseInfo.name, time: 0 });
									}
									this.cfg.studyRecord = records;
								}
							}
						}, 3000);

						// 查找任务
						let list = $$el('li.clearfix.video');
						// 如果不是复习模式，则排除掉已经完成的任务
						if (!this.cfg.restudy) {
							list = list.filter((el) => el.querySelector('.time_icofinish') === null);
						}

						if (list.length === 0) {
							finish();
						} else {
							$message('info', { content: '3秒后开始学习', duration: 3 });
							const study = async () => {
								if (stop === false) {
									const item = list.shift();
									if (item) {
										await $.sleep(3000);
										item.click();
										await $.sleep(5000);
										watch(
											{ volume: this.cfg.volume, playbackRate: this.cfg.playbackRate, definition: this.cfg.definition },
											study
										);
										calculateTime();
									} else {
										finish();
									}
								} else {
									$message('warn', {
										content: '检测到当前视频全部播放完毕，如果还有未完成的视频请刷新重试，或者打开复习模式。'
									});
								}
							};
							study();
						}
					}
				}, 1000);
			}
		}),
		'xnk-study': new Script({
			name: '校内课学习脚本',
			url: [/zhihuishu.com\/aidedteaching\/sourceLearning/],
			namespace: 'zhs.xnk.study',
			configs: {
				notes: {
					defaultValue: $creator.notes(['章节测试请大家观看完视频后手动打开。', '此课程不能使用倍速。']).outerHTML
				},
				restudy: restudy,
				volume: volume,
				definition: definition
			},
			oncomplete() {
				/** 查找任务 */
				let list = $$el('.file-item');

				/** 如果不是复习模式，则排除掉已经完成的任务 */
				if (!this.cfg.restudy) {
					list = list.filter((el) => el.querySelector('.icon-finish') === null);
				}

				const item = list[0];
				if (item) {
					if (item.classList.contains('active')) {
						watch({ volume: this.cfg.volume, playbackRate: 1, definition: this.cfg.definition }, () => {
							/** 下一章 */
							if (list[1]) list[1].click();
						});
					} else {
						item.click();
					}
				}
			}
		}),
		'gxk-work-and-exam-guide': new Script({
			name: '共享课作业考试提示',
			url: [/zhihuishu.com\/stuExamWeb.html#\/webExamList\?/],
			namespace: 'zhs.work.gxk-guide',
			level: 999,
			configs: {
				notes: {
					defaultValue: $creator.notes(
						[
							[
								el('b', '在进行作业或者考试之前，请在”通用-全局设置“中设置好题库配置'),
								el('b', '并在作业和考试脚本中开启自动答题选项，否则将无法正常答题。')
							],
							'考试自动答题在设置中开启，并点击进入即可使用',
							'进入考试页面后需要刷新一下。',
							'考试功能因为被频繁针对所以不稳定, 大家预留好其他搜题方式。'
						],
						'ol'
					).outerHTML
				}
			}
		}),
		'gxk-work': new Script({
			name: '共享课作业脚本',
			url: [
				/zhihuishu.com\/stuExamWeb.html#\/webExamList\/dohomework/,

				/** 在列表中也提供设置页面 */
				/zhihuishu.com\/stuExamWeb.html#\/webExamList\?/
			],
			namespace: 'zhs.gxk.work',
			level: 99,
			configs: workConfigs,

			oncomplete() {
				const changeMsg = () => $message('info', { content: '检测到设置更改，请重新进入，或者刷新作业页面进行答题。' });
				this.onConfigChange('upload', changeMsg);
				this.onConfigChange('auto', changeMsg);

				let worker: OCSWorker<any> | undefined;
				let warn: MessageElement | undefined;

				this.on('start', () => start());
				this.on('render', () => createWorkerControl(this, () => worker));
				this.on('restart', () => {
					worker?.emit('close');
					$message('info', { content: '3秒后重新答题。' });
					setTimeout(start, 3000);
				});

				/** 开始作业 */
				const start = () => {
					warn?.remove();
					// 识别文字
					recognize();
					$creator.workPreCheckMessage({
						onrun: (opts) => {
							worker = gxkWorkOrExam('work', opts);
						},
						ondone: () => this.emit('done'),
						upload: this.cfg.upload,
						...CommonProject.scripts.settings.cfg
					});
				};

				if (/zhihuishu.com\/stuExamWeb.html#\/webExamList\/dohomework/.test(location.href)) {
					/** 显示答题控制按钮 */
					createWorkerControl(this, () => worker);

					if (this.cfg.auto === false) {
						this.emit('done');
						warn = $message('warn', {
							duration: 0,
							content: '自动答题已被关闭！请手动点击开始答题，或者忽略此警告'
						});
					} else {
						const interval = setInterval(() => {
							const vue = $el('#app > div')?.__vue__;
							if (vue?.alllQuestionTest) {
								clearInterval(interval);

								start();
							}
						}, 1000);
					}
				}
			}
		}),

		'gxk-exam': new Script({
			name: '共享课考试脚本',
			url: [
				/zhihuishu.com\/stuExamWeb.html#\/webExamList\/doexamination/,
				/** 在列表中也提供设置页面 */
				/zhihuishu.com\/stuExamWeb.html#\/webExamList\?/
			],
			namespace: 'zhs.gxk.exam',
			level: 99,
			configs: {
				notes: {
					defaultValue: $creator.notes([
						'答题前请在 “通用-全局设置” 中设置题库配置，才能开始自动答题。',
						'可以搭配 “通用-在线搜题” 一起使用。',
						'考试请在脚本自动答题完成后自行检查，自己点击提交，脚本不会自动提交。',
						'如果开启后脚本仍然没有反应，请刷新页面重试。'
					]).outerHTML
				},
				auto: {
					label: '开启自动答题',
					attrs: { type: 'checkbox' },
					defaultValue: false
				}
			},

			async oncomplete() {
				// 重置

				const changeMsg = () => $message('info', { content: '检测到设置更改，请重新进入，或者刷新作业页面进行答题。' });

				this.onConfigChange('auto', changeMsg);

				let worker: OCSWorker<any> | undefined;

				this.on('start', () => start());
				this.on('render', () => createWorkerControl(this, () => worker));
				this.on('restart', () => {
					worker?.emit('close');
					$message('info', { content: '3秒后重新答题。' });
					setTimeout(start, 3000);
				});

				/** 开始考试 */
				const start = () => {
					$creator.workPreCheckMessage({
						onrun: (opts) => {
							worker = gxkWorkOrExam('exam', opts);
						},
						ondone: () => {
							this.emit('done');
						},
						upload: 'nomove',
						...CommonProject.scripts.settings.cfg
					});
				};

				if (/zhihuishu.com\/stuExamWeb.html#\/webExamList\/doexamination/.test(location.href)) {
					/** 显示答题控制按钮 */
					createWorkerControl(this, () => worker);

					if (this.cfg.auto === false) {
						this.emit('done');
						$message('warn', {
							duration: 0,
							content: '自动答题已被关闭！请手动点击开始答题，或者忽略此警告'
						});
					} else {
						await waitForQuestionsLoad();
						// 识别文字
						recognize();
						start();
					}
				}
			}
		}),
		'xnk-work': new Script({
			name: '校内课作业考试脚本',
			url: [/zhihuishu.com\/atHomeworkExam\/stu\/homeworkQ\/exerciseList/],
			namespace: 'zhs.xnk.work',
			level: 99,
			configs: workConfigs,

			oncomplete() {
				const changeMsg = () => $message('info', { content: '检测到设置更改，请重新进入，或者刷新作业页面进行答题。' });
				this.onConfigChange('upload', changeMsg);
				this.onConfigChange('auto', changeMsg);

				let worker: OCSWorker<any> | undefined;

				/** 显示答题控制按钮 */
				createWorkerControl(this, () => worker);

				this.on('start', () => start());
				this.on('restart', () => {
					worker?.emit('close');
					$message('info', { content: '3秒后重新答题。' });
					setTimeout(start, 3000);
				});

				if (this.cfg.auto === false) {
					return $message('warn', {
						duration: 0,
						content: '自动答题已被关闭！请手动点击开始答题，或者忽略此警告'
					});
				}

				const start = () => {
					$creator.workPreCheckMessage({
						onrun: (opts) => {
							worker = xnkWork(opts);
						},
						ondone: () => {
							this.emit('done');
						},
						upload: this.cfg.upload,
						...CommonProject.scripts.settings.cfg
					});
				};
			}
		})
	}
});

/**
 * 观看视频
 * @param setting
 * @returns
 */
async function watch(
	options: { volume: number; playbackRate: number; definition: 'line1bq' | 'line1gq' },
	onended: () => void
) {
	let video = $el<HTMLVideoElement>('video');

	const set = async () => {
		// 设置清晰度
		switchLine(options.definition);
		await $.sleep(1000);

		// 设置播放速度
		switchPlaybackRate(options.playbackRate);
		await $.sleep(500);

		// 上面操作会导致元素刷新，这里重新获取视频
		video = $el<HTMLVideoElement>('video');
		// 如果已经播放完了，则重置视频进度
		video.currentTime = 1;
		await $.sleep(500);

		// 音量
		video.volume = options.volume;
		await $.sleep(500);
	};

	await set();

	video.play().catch(() => {
		$model('alert', {
			content: '由于浏览器保护限制，如果要播放带有音量的视频，您必须先点击页面上的任意位置才能进行视频的播放。',
			onClose: async () => {
				video.play();
			}
		});
	});

	video.onpause = async () => {
		if (!video.ended && stop === false) {
			await waitForCaptcha();
			await $.sleep(1000);
			video.play();
		}
	};

	video.onended = onended;
}

/**
 * 切换视频清晰度
 * @param definition 清晰度的类名
 */
function switchLine(definition: 'line1bq' | 'line1gq' = 'line1bq') {
	$el(`.definiLines .${definition}`)?.click();
}

/**
 * 切换视频清晰度
 * @param playbackRate 播放速度
 */
function switchPlaybackRate(playbackRate: number) {
	$el(`.speedList [rate="${playbackRate === 1 ? '1.0' : playbackRate}"]`)?.click();
}

/**
 * 检测是否有验证码，并等待验证
 */

function checkForCaptcha(update: (hasCaptcha: boolean) => void) {
	let modal: HTMLDivElement | undefined;
	return setInterval(() => {
		if ($el('.yidun_popup')) {
			update(true);
			// 如果弹窗不存在，则显示
			if (modal === undefined) {
				modal = $model('alert', { content: '当前检测到验证码，请输入后方可继续运行。' });
			}
		} else {
			if (modal) {
				update(false);
				// 关闭弹窗
				modal.remove();
				modal = undefined;
			}
		}
	}, 1000);
}

export function waitForCaptcha(): void | Promise<void> {
	const popup = document.querySelector('.yidun_popup');
	if (popup) {
		$message('warn', { content: '当前检测到验证码，请输入后方可继续运行。' });
		return new Promise<void>((resolve, reject) => {
			const interval = setInterval(() => {
				const popup = document.querySelector('.yidun_popup');
				if (popup === null) {
					clearInterval(interval);
					resolve();
				}
			}, 1000);
		});
	}
}

/**
 * 等待题目加载完毕
 */
function waitForQuestionsLoad() {
	return new Promise<void>((resolve) => {
		const interval = setInterval(() => {
			const vue = $el('#app > div')?.__vue__;
			// 等待题目加载
			if (vue?.alllQuestionTest) {
				clearInterval(interval);
				resolve();
			}
		}, 1000);
	});
}

/**
 * 函数劫持
 */
function hack() {
	const vue = $el('.video-study')?.__vue__;
	const empty = () => {};
	vue.checkout = empty;
	vue.notTrustScript = empty;
	vue.checkoutNotTrustScript = empty;
	const _videoClick = vue.videoClick;
	vue.videoClick = function (...args: any[]) {
		const e = new PointerEvent('click');
		const event = Object.create({ isTrusted: true });
		Object.setPrototypeOf(event, e);
		args[args.length - 1] = event;
		return _videoClick.apply(vue, args);
	};
	vue.videoClick = function (...args: any[]) {
		args[args.length - 1] = { isTrusted: true };
		return _videoClick.apply(vue, args);
	};
}

/** 识别试卷文字 */
function recognize() {
	for (const div of $$el('.subject_describe > div')) {
		// @ts-ignore
		div.__vue__.$el.innerHTML = div.__vue__._data.shadowDom.textContent;
	}
}

/**
 * 共享课的作业和考试
 */
function gxkWorkOrExam(
	type: 'work' | 'exam' = 'work',
	{ answererWrappers, period, timeout, retry, upload }: CommonWorkOptions
) {
	$message('info', { content: `开始${type === 'work' ? '作业' : '考试'}` });

	const workResults: WorkResult<any>[] = [];
	// 清空搜索结果
	CommonProject.scripts.workResults.cfg.results = [];
	// 置顶搜索结果面板
	$script.pin(CommonProject.scripts.workResults);

	/** 新建答题器 */
	const worker = new OCSWorker({
		root: '.examPaper_subject',
		elements: {
			title: '.subject_describe,.smallStem_describe',
			options: '.subject_node .nodeLab'
		},
		/** 默认搜题方法构造器 */
		answerer: (elements, type, ctx) =>
			defaultAnswerWrapperHandler(answererWrappers, {
				type,
				title: elements.title[0].innerText,
				root: ctx.root
			}),
		work: {
			/** 自定义处理器 */
			handler(type, answer, option) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					if (!option.querySelector('input')?.checked) {
						option.click();
					}
				} else if (type === 'completion' && answer.trim()) {
					const text = option.querySelector('textarea');
					if (text) {
						text.value = answer;
					}
				}
			}
		},

		/** 完成答题后 */
		onResult: async (res) => {
			// 处理题目跨域丢失问题
			if (res.ctx) {
				res.ctx.root = $.elementToRawObject(res.ctx.root);
				res.ctx.elements.title = res.ctx.elements.title.map($.elementToRawObject);
			}

			workResults.push(res);
			CommonProject.scripts.workResults.cfg.results = workResults;

			console.log(CommonProject.scripts.workResults.cfg);
			await $.sleep(500);
			// 下一页
			$el('div.examPaper_box > div.switch-btn-box > button:nth-child(2)').click();
		},

		/** 其余配置 */

		period: (period === 0 ? 0 : period || 3) * 1000,
		timeout: (timeout || 30) * 1000,
		retry,
		stopWhenError: false
	});

	checkForCaptcha((hasCaptcha) => {
		if (hasCaptcha) {
			worker.emit('stop');
		} else {
			worker.emit('continuate');
		}
	});

	worker
		.doWork()
		.then(async (results) => {
			if (type === 'exam') {
				$message('info', { content: '为了安全考虑，请自行检查后自行点击提交！' });
			} else {
				// 处理提交
				await worker.uploadHandler({
					type: upload,
					results,
					async callback(finishedRate, uploadable) {
						$message('info', {
							content: `完成率 ${finishedRate.toFixed(2)} :  ${uploadable ? '5秒后将自动提交' : '5秒后将自动保存'} `
						});

						await $.sleep(5000);

						// 保存按钮， 提交按钮
						const saveBtn = $el('.btnStyleX:not(.btnStyleXSumit)');
						const uploadBtn = $el('.btnStyleXSumit');

						if (uploadable) {
							uploadBtn?.click();
						} else {
							saveBtn?.click();
						}

						await $.sleep(2000);
						/** 确定按钮 */
						$el("[role='dialog'] .el-button--primary")?.click();
					}
				});
			}
		})
		.catch((err) => {
			$message('error', { content: '提交程序发生错误 : ' + err.message });
		});

	return worker;
}

/**
 * 校内学分课的作业
 */
function xnkWork({ answererWrappers, period, timeout, retry }: CommonWorkOptions) {
	const workResults: WorkResult<any>[] = [];
	// 清空搜索结果
	CommonProject.scripts.workResults.cfg.results = [];
	// 置顶搜索结果面板
	$script.pin(CommonProject.scripts.workResults);

	const worker = new OCSWorker({
		root: '.questionBox',
		elements: {
			title: '.questionContent',
			options: '.optionUl label',
			questionTit: '.questionTit'
		},
		/** 默认搜题方法构造器 */
		answerer: (elements, type, ctx) => {
			const title = StringUtils.nowrap(elements.title[0].innerText).trim();
			if (title) {
				return defaultAnswerWrapperHandler(answererWrappers, { type, title, root: ctx.root });
			} else {
				throw new Error('题目为空，请查看题目是否为空，或者忽略此题');
			}
		},
		work: {
			/** 自定义处理器 */
			handler(type, answer, option, ctx) {
				if (type === 'judgement' || type === 'single' || type === 'multiple') {
					if (option.querySelector('input')?.checked === false) {
						option.click();
					}
				} else if (type === 'completion' && answer.trim()) {
					const text = option.querySelector('textarea');
					if (text) {
						text.value = answer;
					}
				}
			}
		},

		onResult: (res) => {
			// 处理题目跨域丢失问题
			if (res.ctx) {
				res.ctx.root = $.elementToRawObject(res.ctx.root);
				res.ctx.elements.title = res.ctx.elements.title.map($.elementToRawObject);
			}
			workResults.push(res);
			CommonProject.scripts.workResults.cfg.results = workResults;
		},
		period: (period || 3) * 1000,
		timeout: (timeout || 30) * 1000,
		retry,
		stopWhenError: false
	});

	const getBtn = () => document.querySelector('span.Topicswitchingbtn:nth-child(2)') as HTMLElement;
	let next = getBtn();

	(async () => {
		while (next && worker.isClose === false) {
			await worker.doWork();
			await $.sleep((period || 3) * 1000);
			next = getBtn();
			next?.click();
			await $.sleep((period || 3) * 1000);
		}
	})();

	return worker;
}

function optimizeSecond(second: number) {
	return second / 3600 < 1 ? `${(second / 60).toFixed(2)}分钟` : `${(second / 3600).toFixed(2)}小时`;
}

/**
 * 答题控制
 */
function createWorkerControl(
	script: Script<Omit<typeof workConfigs, 'upload'>>,
	getWorker: () => OCSWorker<any> | undefined
) {
	const worker = getWorker();
	let stop = true;
	const startBtn = $creator.button('▶️开始答题');
	const restartBtn = $creator.button('↩️重新答题');
	const controlBtn = $creator.button('⏸️暂停答题');

	startBtn.onclick = () => {
		startBtn.remove();
		script.panel?.body.replaceChildren(el('hr'), restartBtn, controlBtn);
		script.emit('start');
	};
	restartBtn.onclick = () => script.emit('restart');
	controlBtn.onclick = () => {
		stop = !stop;
		const worker = getWorker();
		worker?.emit?.(stop ? 'continuate' : 'stop');
		controlBtn.value = stop ? '⏸️暂停答题' : '▶️继续答题';
	};

	script.on('done', () => (controlBtn.disabled = true));

	if (script.panel) {
		script.panel.body.style.textAlign = 'right';
	}

	script.panel?.body.replaceChildren(el('hr'), ...(worker?.isRunning ? [restartBtn, controlBtn] : [startBtn]));
}
