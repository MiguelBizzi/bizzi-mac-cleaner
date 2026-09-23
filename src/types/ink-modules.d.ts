declare module "ink-select-input" {
  import type { ReactElement } from "react";
  export interface Item<V = string> {
    label: string;
    value: V;
    key?: string;
  }
  export default function SelectInput<V = string>(props: {
    items: Array<Item<V>>;
    onSelect: (item: Item<V>) => void;
  }): ReactElement;
}

declare module "ink-spinner" {
  import type { ReactElement } from "react";
  export default function Spinner(props: { type?: string }): ReactElement;
}

declare module "ink-text-input" {
  import type { ReactElement } from "react";
  export default function TextInput(props: {
    value: string;
    onChange: (value: string) => void;
    onSubmit?: (value: string) => void;
  }): ReactElement;
}
