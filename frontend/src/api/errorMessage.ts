import { ApiError } from "./client";

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.problem.detail || error.problem.title;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong.";
}
