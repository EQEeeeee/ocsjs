import { AnswererWrapper } from '../core/worker/answer.wrapper.handler';
import { WorkUploadType } from '../core/worker/interface';
import { ConfigElement } from '../elements/config';
import { Config } from '../interfaces/config';
import { $message, $model } from '../projects/init';

import { namespaceKey } from './common';
import { ElementChildren, ElementHandler, el } from './dom';

export interface CommonWorkOptions {
	period: number;
	timeout: number;
	retry: number;
	upload: WorkUploadType;
	answererWrappers: AnswererWrapper[];
}

export const $creator = {
	/**
	 * 启动元素提示气泡，根据元素 title 即时显示，（兼容手机端的提示）
	 * @param target
	 */
	tooltip<T extends HTMLElement>(target: T) {
		const title = el('div', { className: 'tooltip' });
		target.setAttribute('data-title', target.title);
		// 取消默认title，避免系统默认事件重复显示
		target.removeAttribute('title');

		const onMouseMove = (e: MouseEvent) => {
			title.style.top = e.y + 'px';
			title.style.left = e.x + 'px';
		};
		const showTitle = (e: MouseEvent) => {
			const dataTitle = target.getAttribute('data-title');
			if (dataTitle) {
				title.style.display = 'block';
				title.innerHTML = dataTitle.split('\n').join('<br>') || '';
				title.style.top = e.y + 'px';
				title.style.left = e.x + 'px';
				target.after(title);
			}

			window.addEventListener('mousemove', onMouseMove);
		};
		const hideTitle = () => {
			title.style.display = 'none';
			window.removeEventListener('mousemove', onMouseMove);
		};
		hideTitle();
		target.addEventListener('mouseenter', showTitle as any);
		target.addEventListener('click', showTitle as any);
		target.addEventListener('mouseout', hideTitle);
		target.addEventListener('blur', hideTitle);

		return target;
	},

	/**
	 * 创建 select 元素的子选项
	 * @param selectedValue
	 * @param options [value,text,title]
	 * @returns
	 */
	selectOptions(selectedValue: string | null = '', options: ([any, string] | [any, string, string])[]) {
		return options.map((opt) =>
			el('option', { value: String(opt[0]), innerText: opt[1], title: opt[2] }, (opt) => {
				if (opt.value === selectedValue) {
					opt.toggleAttribute('selected');
				}
			})
		);
	},
	input(
		attrs?: Partial<HTMLInputElement> | undefined,
		children?: ElementChildren,
		handler?: ElementHandler<'input'> | undefined
	) {
		return el('input', attrs, function (input) {
			input.append(...(children || []));
			input.classList.add('base-style-input');
			handler?.apply(this, [input]);
		});
	},
	button(
		attrs?: Omit<Partial<HTMLInputElement>, 'type'> | undefined,
		children?: ElementChildren,
		handler?: ElementHandler<'input'> | undefined
	) {
		return el('input', { type: 'button', ...attrs }, function (btn) {
			btn.append(...(children || []));
			btn.classList.add('base-style-button');
			handler?.apply(this, [btn]);
		});
	},
	/** 创建设置区域 */

	configs<T extends Record<string, Config<any>>>(namespace: string | undefined, configs: T) {
		const elements: { [K in keyof T]: ConfigElement<T[K]['tag']> } = Object.create({});
		for (const key in configs) {
			if (Object.prototype.hasOwnProperty.call(configs, key)) {
				const cfg = configs[key];
				if (cfg.label !== undefined) {
					const element = el('config-element', {
						key: namespaceKey(namespace, key),
						tag: cfg.tag,
						sync: cfg.sync,
						attrs: cfg.attrs,
						_onload: cfg.onload
					});
					element.label.textContent = cfg.label;
					elements[key] = element;
				}
			}
		}

		return elements;
	},
	/**
	 * 生成一个复制按钮
	 * @param name 按钮名
	 * @param value 复制内容
	 */
	copy(name: string, value: string) {
		return el('span', '📄' + name, (btn) => {
			btn.className = 'copy';

			btn.addEventListener('click', () => {
				btn.innerText = '已复制√';
				navigator.clipboard.writeText(value);
				setTimeout(() => {
					btn.innerText = '📄' + name;
				}, 500);
			});
		});
	},
	/** 创建一个取消默认事件的文字按钮，如果不点击，则执行默认事件 */
	preventText({
		name,
		delay = 3,
		autoRemove = true,
		ondefault,
		onprevent
	}: {
		name: string;
		delay?: number;

		autoRemove?: boolean;
		ondefault: (span: HTMLSpanElement) => void;
		onprevent?: (span: HTMLSpanElement) => void;
	}) {
		const span = el('span', name);

		span.style.textDecoration = 'underline';
		span.style.cursor = 'pointer';
		span.onclick = () => {
			clearTimeout(id);
			if (autoRemove) {
				span.remove();
			}
			onprevent?.(span);
		};
		const id = setTimeout(() => {
			if (autoRemove) {
				span.remove();
			}
			ondefault(span);
		}, delay * 1000);

		return span;
	},
	/** 创建答题预处理信息 */
	workPreCheckMessage(
		options: CommonWorkOptions & {
			onrun: (opts: CommonWorkOptions) => void;
		}
	) {
		const { onrun, ...opts } = options;

		if (opts.answererWrappers.length === 0) {
			$model('alert', { content: '题库配置为空，请设置。' });
		} else {
			$message('info', {
				duration: 5,
				content: el('span', [
					'5秒后自动答题。并切换到“通用-搜索结果”。',
					$creator.preventText({
						name: '点击取消此次答题',
						delay: 5,
						ondefault: (span) => {
							onrun(opts);
						},
						onprevent(span) {
							$message('warn', { content: '已经关闭此次的自动答题，刷新页面后可重新开始答题。' });
						}
					})
				])
			});
		}
	}
};
