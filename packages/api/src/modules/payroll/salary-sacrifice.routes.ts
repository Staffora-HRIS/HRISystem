/**
 * Salary Sacrifice Routes (Payroll Sub-Module)
 *
 * Re-exports the standalone salary-sacrifice module's routes.
 *
 * The canonical route definitions live in modules/salary-sacrifice/routes.ts.
 * This re-export allows the payroll routes to compose salary sacrifice
 * endpoints under the /payroll prefix via `.use(salarySacrificeRoutes)`.
 */

export {
  salarySacrificeRoutes,
  type SalarySacrificeRoutes,
} from "../salary-sacrifice/routes";
