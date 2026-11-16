import { Router } from "express";
import "../utils/routerGroup.js";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../middlewares/asyncHandler.middleware.js";
import { validateBody, validateParams } from "../middlewares/validate.middleware.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { uploadSingleFile } from "../middlewares/upload.middleware.js";
import { AuthController } from "../controllers/auth.controller.js";
import { DashboardController } from "../controllers/dashboard.controller.js";
import { ProjectController } from "../controllers/project.controller.js";
import { DocumentController } from "../controllers/document.controller.js";
import { AuthService } from "../services/auth.service.js";
import { DashboardService } from "../services/dashboard.service.js";
import { ProjectService } from "../services/project.service.js";
import { OcrService } from "../services/ocr.service.js";
import { EmbeddingService } from "../services/embedding.service.js";
import { DocumentService } from "../services/document.service.js";
import { UserRepository } from "../repositories/user.repository.js";
import { DashboardRepository } from "../repositories/dashboard.repository.js";
import { ProjectRepository } from "../repositories/project.repository.js";
import { DocumentRepository } from "../repositories/document.repository.js";
import { loginSchema, registerSchema } from "../validators/auth.validator.js";
import {
  createProjectSchema,
  projectIdParamsSchema,
  updateProjectSchema,
} from "../validators/project.validator.js";

const userRepository = new UserRepository(pool);
const dashboardRepository = new DashboardRepository(pool);
const projectRepository = new ProjectRepository(pool);
const documentRepository = new DocumentRepository(pool);

const authService = new AuthService(userRepository);
const authController = new AuthController(authService);

const dashboardService = new DashboardService(userRepository, dashboardRepository);
const dashboardController = new DashboardController(dashboardService);

const projectService = new ProjectService(projectRepository);
const projectController = new ProjectController(projectService);

const ocrService = new OcrService();
const embeddingService = new EmbeddingService({
  apiKey: env.gemini.apiKey,
  model: env.gemini.embeddingModel,
});
const documentService = new DocumentService(
  projectService,
  documentRepository,
  ocrService,
  embeddingService,
);
const documentController = new DocumentController(documentService);

const apiRouter = Router();

apiRouter.group("/auth", (router) => {
  router.post("/register", validateBody(registerSchema), asyncHandler(authController.register));
  router.post("/login", validateBody(loginSchema), asyncHandler(authController.login));
});

apiRouter.group("/users", [authenticate], (router) => {
  router.get("/me", asyncHandler(dashboardController.getMe));
});

apiRouter.group("/dashboard", [authenticate], (router) => {
  router.get("/", asyncHandler(dashboardController.getDashboard));
});

apiRouter.group("/projects", [authenticate], (router) => {
  const validId = validateParams(projectIdParamsSchema);

  router.get("/", asyncHandler(projectController.list));
  router.post("/", validateBody(createProjectSchema), asyncHandler(projectController.create));
  router.get("/:id", validId, asyncHandler(projectController.get));
  router.patch(
    "/:id",
    validId,
    validateBody(updateProjectSchema),
    asyncHandler(projectController.update),
  );
  router.delete("/:id", validId, asyncHandler(projectController.remove));

  // OCR a PDF or image (multipart field `file`, max 5 MB), embed the text and save it as chunks.
  router.post("/:id/ocr", validId, uploadSingleFile, asyncHandler(documentController.ocr));
  router.get("/:id/documents", validId, asyncHandler(documentController.list));
});

export default apiRouter;
