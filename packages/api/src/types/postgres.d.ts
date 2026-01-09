/**
 * Type augmentation for postgres.js library
 * 
 * The postgres library's TransactionSql type doesn't properly expose
 * the tagged template literal call signature. This declaration fixes that.
 */

import "postgres";

declare module "postgres" {
  interface TransactionSql<TTypes extends Record<string, unknown> = {}> {
    <T extends readonly (object | undefined)[]>(
      template: TemplateStringsArray,
      ...parameters: readonly ParameterOrFragment<TTypes[keyof TTypes]>[]
    ): PendingQuery<T extends readonly (infer R)[] ? R[] : never>;
  }
}
