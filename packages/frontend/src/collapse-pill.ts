// Pure logic for the collapse-to-pill toggle on a chat shape.
// Collapsed state and the restore height live entirely in shape props.

export const COLLAPSED_HEIGHT = 44;

export interface CollapseProps {
  collapsed: boolean;
  h: number;
  expandedH: number;
}

/** Compute the next {collapsed, h, expandedH} for toggling a chat shape.
 *  Collapsing remembers the current height; expanding restores it. */
export function collapseToggle(props: CollapseProps): CollapseProps {
  if (props.collapsed) {
    return { collapsed: false, h: props.expandedH, expandedH: props.expandedH };
  }
  return { collapsed: true, h: COLLAPSED_HEIGHT, expandedH: props.h };
}
