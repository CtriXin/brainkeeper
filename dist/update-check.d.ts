export declare function currentVersion(): string;
export declare function printVersion(): void;
export declare function maybePrintUpdateNotice(): Promise<void>;
export declare function isNewer(candidate: string, current: string): boolean;
