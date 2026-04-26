/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />

declare const __DEV__: boolean;

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}
