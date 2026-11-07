import { useEffect, useRef, useState } from 'preact/hooks';
import { store as defaultStore, type ToyState, type ToyStore } from '../state/store';

/** Subscribes a Preact component to a slice of the vanilla store. */
export function useStore<T>(selector: (s: ToyState) => T, store: ToyStore = defaultStore): T {
  const [value, setValue] = useState(() => selector(store.getState()));
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  useEffect(() => {
    const update = (s: ToyState) => setValue(() => selectorRef.current(s));
    update(store.getState());
    return store.subscribe(update);
  }, [store]);
  return value;
}
