import { router } from "../trpc";
import { courseRouter } from "./course.router";

export const appRouter = router({
  course: courseRouter,
});

export type AppRouter = typeof appRouter;
