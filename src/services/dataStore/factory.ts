import { Context } from "../context";
import { DataStore } from "./dataStore";

export interface DataStoreFactory {
  create(ctx: Context, id: string, defaults: object): Promise<DataStore>;
  get(ctx: Context, id: string): DataStore | null;
  delete(ctx: Context, id: string): boolean;
}
