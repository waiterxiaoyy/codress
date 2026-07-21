package router

import (
	"codress/server/internal/auth"
	"codress/server/internal/config"
	"codress/server/internal/handler"
	"codress/server/internal/middleware"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func New(db *gorm.DB, cfg *config.Config) *gin.Engine {
	if cfg.GinMode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery(), middleware.CORS())
	if cfg.GinMode != "release" {
		r.Use(gin.Logger())
	}
	r.MaxMultipartMemory = 20 << 20

	oauthSvc := auth.NewOAuth(cfg)
	public := &handler.Public{DB: db, Cfg: cfg, OAuth: oauthSvc}
	admin := &handler.Admin{DB: db, Cfg: cfg}

	r.Static("/static", cfg.StorageDir)
	r.GET("/", public.Health)

	v1 := r.Group("/api/v1")
	{
		v1.GET("/health", public.Health)
		v1.GET("/categories", public.ListCategories)
		v1.GET("/skins", public.ListSkins)
		v1.GET("/skins/:slug", public.GetSkin)
		v1.POST("/skins/:slug/download", middleware.OptionalUser(cfg.JWTSecret), public.DownloadSkin)
		v1.GET("/pets", public.ListPets)
		v1.GET("/pets/:slug", public.GetPet)
		v1.POST("/pets/:slug/download", middleware.OptionalUser(cfg.JWTSecret), public.DownloadPet)
		v1.GET("/adapters/:appId", public.GetAdapter)
		v1.GET("/client/latest", public.LatestClient)
		v1.POST("/telemetry/verify", public.PostTelemetry)

		authGroup := v1.Group("/auth")
		{
			authGroup.GET("/providers", public.AuthProviders)
			authGroup.GET("/oauth/:provider/login", public.OAuthLogin)
			authGroup.GET("/oauth/:provider/callback", public.OAuthCallback)
			authGroup.POST("/dev", public.DevLogin)
		}

		me := v1.Group("/me", middleware.RequireRole(cfg.JWTSecret, auth.RoleUser))
		{
			me.GET("", public.Me)
			me.GET("/events", public.MyEvents)
			me.POST("/events", public.CreateEvent)
			me.GET("/favorites", public.ListFavorites)
			me.POST("/favorites/toggle", public.ToggleFavorite)
		}
	}

	adminAPI := r.Group("/api/admin")
	{
		adminAPI.POST("/auth/login", admin.Login)
		authed := adminAPI.Group("", middleware.RequireRole(cfg.JWTSecret, auth.RoleAdmin))
		{
			authed.GET("/me", admin.Me)
			authed.GET("/stats/overview", admin.StatsOverview)

			authed.GET("/skins", admin.ListSkins)
			authed.POST("/skins", admin.CreateSkin)
			authed.PUT("/skins/:id", admin.UpdateSkin)
			authed.POST("/skins/:id/assets", admin.UploadSkinAssets)
			authed.POST("/skins/:id/status", admin.SetSkinStatus)
			authed.DELETE("/skins/:id", admin.DeleteSkin)
			// AI 生成
			authed.POST("/skins/ai-generate", admin.GenerateSkinMeta)
			authed.POST("/skins/ai-image-prompt", admin.GenerateSkinPrompt)

			authed.GET("/pets", admin.ListPets)
			authed.POST("/pets", admin.CreatePet)
			authed.PUT("/pets/:id", admin.UpdatePet)
			authed.POST("/pets/:id/assets", admin.UploadPetAssets)
			authed.POST("/pets/:id/status", admin.SetPetStatus)
			authed.DELETE("/pets/:id", admin.DeletePet)

			authed.GET("/categories", admin.ListCategories)
			authed.POST("/categories", admin.CreateCategory)
			authed.PUT("/categories/:id", admin.UpdateCategory)
			authed.DELETE("/categories/:id", admin.DeleteCategory)

			authed.GET("/adapters", admin.ListAdapters)
			authed.POST("/adapters", admin.CreateAdapter)
			authed.PUT("/adapters/:id", admin.UpdateAdapter)
			authed.POST("/adapters/:id/status", admin.SetAdapterStatus)

			authed.GET("/releases", admin.ListReleases)
			authed.POST("/releases", admin.CreateRelease)
			authed.DELETE("/releases/:id", admin.DeleteRelease)

			authed.GET("/users", admin.ListUsers)
			authed.GET("/users/:id/events", admin.UserEvents)
			authed.GET("/telemetry", admin.ListTelemetry)
		}
	}
	return r
}
