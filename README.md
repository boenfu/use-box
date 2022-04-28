# use-box

📦 just a box, nobody use

## Example

```ts
interface BoxState {
  label: string | undefined;
  size: number;
}

const labelBox = createBox(
  {
    label: undefined,
    size: 0,
  } as BoxState,
  {
    async fetch() {
      let {label, size} = fetch('https://box.server');

      return {
        label,
        size,
      };
    },
    increase(state, size) {
      if (state.size + size > 10) {
        return;
      }

      return {
        size: state.size + size,
      };
    },
  },
  {
    defaultAutoResolveUpdateDependencies: true,
  },
);

export const useLabelBox = labelBox.useBox;
```

```tsx
const Component: FC = () => {
  const [{label, size}, {increase}] = useLabelBox();
  //
  return <></>;
};
```

> // TODO: getter example & docs

## Features

- [x] getter value
- [x] async action ( Support partial state update )
- [x] auto resolve update dependencies ( Power by Proxy )
- [x] types safe

## License

MIT
