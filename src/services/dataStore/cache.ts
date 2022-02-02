import { DataStore } from "./dataStore";

export type DataStoreCache = {
  get(key: string): DataStore | null;
  set(key: string, value: DataStore): void;
  unset(key: string): void;
};

export class InMemoryCache implements DataStoreCache {
  private readonly cache: Record<string, DataStore> = {};

  get(key: string): DataStore | null {
    return this.cache[key];
  }

  set(key: string, value: DataStore): void {
    this.cache[key] = value;
  }

  unset(key: string): void {
    delete this.cache[key];
  }
}

export class NoOpCache implements DataStoreCache {
  get(): DataStore | null {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  set(): void {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  unset(): void {}
}
