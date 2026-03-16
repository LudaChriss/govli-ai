/**
 * Type declarations for packages without @types
 */

declare module 'inquirer' {
  export interface QuestionBase {
    type: string;
    name: string;
    message: string;
    default?: any;
    validate?: (input: any) => boolean | string;
    mask?: string;
  }

  export interface Question extends QuestionBase {
    type: 'input' | 'password' | 'confirm' | 'list' | 'checkbox';
  }

  export function prompt(questions: Question[]): Promise<any>;
}

declare module 'cli-progress' {
  export class SingleBar {
    constructor(options: any);
    start(total: number, startValue: number): void;
    update(value: number): void;
    stop(): void;
  }
}

declare module 'chalk' {
  interface Chalk {
    bold: Chalk;
    green: Chalk;
    red: Chalk;
    yellow: Chalk;
    blue: Chalk;
    (text: string): string;
  }

  const chalk: Chalk;
  export default chalk;
}
