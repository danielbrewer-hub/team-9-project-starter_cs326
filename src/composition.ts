import { CreateAdminUserService } from "./auth/AdminUserService"
import { CreateAuthController } from "./auth/AuthController"
import { CreateAuthService } from "./auth/AuthService"
import { CreateInMemoryUserRepository } from "./auth/InMemoryUserRepository"
import { CreatePasswordHasher } from "./auth/PasswordHasher"
import { CreateApp } from "./app"
import { CreateEventCreationController } from "./events/EventCreationController"
import { CreateEventCreationService } from "./events/EventCreationService"
import { CreateEventDetailController } from "./events/EventDetailController"
import { CreateEventDetailService } from "./events/EventDetailService"
import { CreateHomeController } from "./home/HomeController"
import { CreateInMemoryHomeContentRepository } from "./home/InMemoryHomeRepository"
import { CreateHomeService } from "./home/HomeService"
import { CreateRsvpDashboardController } from "./home/RsvpDashboardController"
import { CreateRsvpDashboardService } from "./home/RsvpDashboardService"
import { CreateEventService } from "./events/EventService"
import { CreateEventController } from "./events/EventController"
import type { IApp } from "./contracts"
import { CreateLoggingService } from "./service/LoggingService"
import type { ILoggingService } from "./service/LoggingService"

export function createComposedApp(logger?: ILoggingService): IApp {
  const resolvedLogger = logger ?? CreateLoggingService()

  // Authentication & authorization wiring
  const authUsers = CreateInMemoryUserRepository()
  const passwordHasher = CreatePasswordHasher()
  const authService = CreateAuthService(authUsers, passwordHasher)
  const adminUserService = CreateAdminUserService(authUsers, passwordHasher)
  const authController = CreateAuthController(authService, adminUserService, resolvedLogger)

  // Home & RSVP wiring
  const homeContentRepository = CreateInMemoryHomeContentRepository()
  const eventCreationService = CreateEventCreationService(homeContentRepository)
  const eventCreationController = CreateEventCreationController(
    eventCreationService,
    resolvedLogger,
  )
  const eventDetailService = CreateEventDetailService(homeContentRepository, authUsers)
  const eventDetailController = CreateEventDetailController(
    eventDetailService,
    resolvedLogger,
  )
  const homeService = CreateHomeService(homeContentRepository)
  const homeController = CreateHomeController(homeService, resolvedLogger)
  const rsvpDashboardService = CreateRsvpDashboardService(homeContentRepository)
  const rsvpDashboardController = CreateRsvpDashboardController(rsvpDashboardService, resolvedLogger)

  // Events wiring
  const eventService = CreateEventService(homeContentRepository)
  const eventController = CreateEventController(eventService)

  return CreateApp(
    authController,
    eventCreationController,
    eventDetailController,
    homeController,
    rsvpDashboardController,
    eventController,
    resolvedLogger
  )
}