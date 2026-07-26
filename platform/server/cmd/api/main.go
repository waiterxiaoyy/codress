package main

import (
	"log"
	"os"

	"codress/server/internal/config"
	"codress/server/internal/database"
	"codress/server/internal/router"
	"codress/server/internal/storage"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	if err := os.MkdirAll(cfg.StorageDir, 0o755); err != nil {
		log.Fatalf("create storage dir: %v", err)
	}
	if err := storage.ConfigureCOS(cfg.COSBucketURL, cfg.COSSecretID, cfg.COSSecretKey); err != nil {
		log.Fatalf("cos: %v", err)
	}
	db, err := database.Open(cfg)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	r := router.New(db, cfg)
	assetMode := "local:" + cfg.StorageDir
	if storage.COSEnabled() {
		assetMode = "cos:" + cfg.COSBucketURL
	}
	log.Printf("[codress] api listening on :%s (driver=%s, assets=%s)", cfg.Port, cfg.DBDriver, assetMode)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
