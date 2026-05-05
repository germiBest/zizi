type ElProps<T extends Element> = Partial<Omit<T, 'children' | 'style'>> & {
  style?: Partial<CSSStyleDeclaration>;
  dataset?: Record<string, string>;
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: ElProps<HTMLElementTagNameMap[K]>,
  children?: ReadonlyArray<Node | string>,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props) {
    const { style, dataset, ...rest } = props;
    Object.assign(e, rest);
    if (style) Object.assign(e.style, style);
    if (dataset) Object.assign(e.dataset, dataset);
  }
  if (children) for (const c of children) e.append(c);
  return e;
}

export const div = (cls?: string, children?: ReadonlyArray<Node | string>) =>
  el('div', cls ? { className: cls } : undefined, children);

export const span = (cls?: string, text?: string) =>
  el('span', { className: cls ?? '', textContent: text ?? '' });

export const button = (cls: string, text: string, onClick: () => void) => {
  const b = el('button', { className: cls, type: 'button', textContent: text });
  b.addEventListener('click', onClick);
  return b;
};

export function mount<T extends Element>(host: HTMLElement, node: T): T {
  host.appendChild(node);
  return node;
}
