import { CreateAdminUserService } from "./auth/AdminUserService";
import { CreateAuthController } from "./auth/AuthController";
import { CreateAuthService } from "./auth/AuthService";
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository";
import { CreatePasswordHasher } from "./auth/PasswordHasher";
import { CreateApp } from "./app";
import { CreateHomeController } from "./home/HomeController";
import { CreateInMemoryHomeContentRepository } from "./home/InMemoryHomeRepository";
import { CreateHomeService } from "./home/HomeService";
import type { IApp } from "./contracts";
import { CreateLoggingService } from "./service/LoggingService";
import type { ILoggingService } from "./service/LoggingService";
import { InMemoryEventRepository } from "./events/InMemoryEventRepository";
import { EventService } from "./events/EventService";
import { EventController } from "./events/EventController";

export function createComposedApp(logger?: ILoggingService): IApp {
  const resolvedLogger = logger ?? CreateLoggingService();

  // Authentication & authorization wiring
  const authUsers = CreateInMemoryUserRepository();
  const passwordHasher = CreatePasswordHasher();
  const authService = CreateAuthService(authUsers, passwordHasher);
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher);
  const authController = CreateAuthController(authService, adminUserService, resolvedLogger);

  // Home wiring
  const homeContentRepository = CreateInMemoryHomeContentRepository();
  const homeService = CreateHomeService(homeContentRepository);
  const homeController = CreateHomeController(homeService, resolvedLogger);

  // Event wiring
  const eventRepo = new InMemoryEventRepository();
  const eventService = new EventService(eventRepo);
  const eventController = new EventController(eventService);

  return CreateApp(authController, homeController, resolvedLogger, eventController);
}