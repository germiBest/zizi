// TODO(week 5-6): 3-up viewport (3D + axial + sagittal + coronal).
// Each MPR viewport is a small canvas; renderer dispatches MPR compute per viewport.
export class MprViewport {
  constructor(_host: HTMLElement, _plane: 'axial' | 'sagittal' | 'coronal') {}
}
