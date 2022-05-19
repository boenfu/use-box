import {cloneDeep, get, isEqual} from 'lodash-es';
import {useEffect, useRef, useState} from 'react';

type Action<TState> = (
  state: TState,
  ...args: any[]
) => Partial<TState> | void | Promise<Partial<TState> | void>;

type Getter<TState> = (state: TState) => any;

export interface BoxHooks<TState> {
  afterUpdate?(state: TState): void;
}

export interface CreateBoxOptions<TState> {
  /**
   * 模块标识，方便 debug
   */
  name?: string;
  /**
   * `autoResolveUpdateDependencies` 默认设置
   */
  autoResolveDependencies?: boolean;
  hooks?: BoxHooks<TState>;
}

export interface UseBoxOptions<TState, TGetters> {
  /**
   * 更新函数标识，方便 debug
   */
  label?: string;
  getters?: TGetters;
  /**
   * 前后 state 返回的数组内容不一致时才触发 setState, 避免不必要的重渲染
   */
  updateDependencies?(state: TState): any[];
  /**
   * 自动收集使用到的 state，仅第一层
   */
  autoResolveDependencies?: boolean;
}

export interface IBox<TState, TAction> {
  queue: {
    [key in symbol]: (current: TState, next: TState) => void;
  };
  state: TState;
  actions: TAction;
  broadcast(current: TState, next: TState): void;
  useBox<TGetters extends Dict<Getter<TState>>>(
    options?: UseBoxOptions<TState, TGetters>,
  ): [TState, TAction, Dict<any>];
}

export function createBox<
  TState extends Dict<any>,
  TAction extends Dict<Action<TState>>,
>(
  initialState: TState,
  actions: TAction,
  {
    name: boxName,
    autoResolveDependencies: defaultAutoResolveDependencies,
    hooks: {afterUpdate} = {},
  }: CreateBoxOptions<TState> = {},
): {
  state: TState;
  actions: {
    [TName in keyof TAction]: (
      ...args: Shift<Parameters<TAction[TName]>>
    ) => ReturnType<TAction[TName]>;
  };
  useBox<TGetters extends Dict<Getter<TState>>>(
    options?: UseBoxOptions<TState, TGetters>,
  ): [
    TState,
    {
      [TName in keyof TAction]: (
        ...args: Shift<Parameters<TAction[TName]>>
      ) => ReturnType<TAction[TName]>;
    },
    UnionToIntersection<
      TGetters extends object
        ? keyof TGetters extends infer TGetterKey
          ? TGetterKey extends string
            ? TGetterKey extends keyof TGetters
              ? {[key in TGetterKey]: ReturnType<TGetters[TGetterKey]>}
              : never
            : never
          : never
        : undefined
    >,
  ];
} {
  let box: IBox<TState, TAction> = {
    queue: {},
    actions: Object.entries(actions).reduce(function (actions, [name, fn]) {
      actions[name as keyof TAction] = (async (...args: any[]) => {
        let partialUpdatedState = await fn.call(
          undefined,
          cloneDeep(box.state),
          ...args,
        );

        if (!partialUpdatedState) {
          return;
        }

        let currentState = cloneDeep(box.state);

        Object.assign(box.state, partialUpdatedState);

        if (isEqual(currentState, box.state)) {
          return box.state;
        }

        box.broadcast(currentState, box.state);

        afterUpdate?.(box.state);

        return box.state;
      }) as TAction[keyof TAction];

      return actions;
      // eslint-disable-next-line @mufan/no-object-literal-type-assertion
    }, {} as TAction),
    state: initialState,
    broadcast(current: TState, next: TState) {
      Object.getOwnPropertySymbols(box.queue).forEach(key =>
        box.queue[key]?.(current, next),
      );
    },
    useBox<TGetters extends Dict<Getter<TState>>>({
      label = 'setState',
      getters,
      updateDependencies,
      autoResolveDependencies = defaultAutoResolveDependencies,
    }: UseBoxOptions<TState, TGetters> = {}) {
      const gettersValue = useRef<Dict<any>>(
        resolveGetterValues(box.state, getters),
      );

      const [, setState] = useState({});

      const dependenciesKeys: string[] = [];

      const symbolDescription = boxName ? `${boxName}-${label}` : label;

      useEffect(() => {
        const tag = Symbol(symbolDescription);

        box.queue[tag] = (current: TState, next: TState) => {
          let checker: (() => boolean)[] = [];

          if (autoResolveDependencies) {
            checker.push(() =>
              dependenciesKeys.every(dependenciesKey =>
                isEqual(
                  get(current, dependenciesKey),
                  get(next, dependenciesKey),
                ),
              ),
            );
          }

          if (updateDependencies) {
            checker.push(() =>
              isEqual(updateDependencies(current), updateDependencies(next)),
            );
          }

          // 判断 checker.length 的意图是：
          // 仅在包含有前两种更新检查才把 getters 做为附加判断条件
          // 即：前两种检查满足了不更新的条件，但 getters 发生变化了，仍然触发更新
          if (checker.length && getters && Object.keys(getters).length) {
            checker.push(() =>
              Object.values(getters).every(getter =>
                isEqual(getter(current), getter(next)),
              ),
            );
          }

          if (checker.length && checker.every(run => run())) {
            return;
          }

          gettersValue.current = resolveGetterValues(next, getters);

          setState({});
        };

        return () => {
          delete box.queue[tag];
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);

      return [
        autoResolveDependencies
          ? new Proxy(box.state, {
              get(t, k: string) {
                dependenciesKeys.push(k);
                return t[k];
              },
              set(t, k, v) {
                t[k as keyof TState] = v;
                return true;
              },
            })
          : box.state,
        box.actions,
        gettersValue.current,
      ];
    },
  };

  // 这个类型不想麻烦了，囧
  return box as any;
}

function resolveGetterValues<TState>(
  state: TState,
  getters: Dict<Getter<TState>> | undefined,
): Dict<any> {
  return getters
    ? Object.entries(getters).reduce<Dict<any>>(
        (gettersValue, [key, getter]) => {
          gettersValue[key] = getter(state);
          return gettersValue;
        },
        {},
      )
    : {};
}

/////////////
/// types ///
/////////////
export interface Dict<T> {
  [K: string]: T;
}

type Shift<TArray extends any[]> = TArray extends [any, ...infer TRest]
  ? TRest
  : never;

type _UnionToIntersection<U> = (
  U extends any ? (u: U) => void : never
) extends (i: infer I) => void
  ? I
  : never;

// https://stackoverflow.com/a/67609110
type UnionToIntersection<U> = boolean extends U
  ? _UnionToIntersection<Exclude<U, boolean>> & boolean
  : _UnionToIntersection<U>;
