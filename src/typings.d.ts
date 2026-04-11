// Type declarations for modules without built-in types
declare module 'sql.js' {
	interface Database {
		prepare(sql: string): Statement;
		exec(sql: string): QueryExecResult[];
		close(): void;
		run(sql: string, params?: unknown[]): Database;
	}
	interface Statement {
		bind(params?: unknown[]): boolean;
		step(): boolean;
		getAsObject(): Record<string, unknown>;
		free(): boolean;
		reset(): boolean;
	}
	interface QueryExecResult {
		columns: string[];
		values: unknown[][];
	}
	export default function initSqlJs(config?: { wasmBinary?: ArrayBuffer }): Promise<{ Database: new (data?: ArrayLike<number> | ArrayLike<ArrayLike<number>>) => Database }>;
	export { Database };
}