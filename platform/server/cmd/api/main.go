package main

import (
	"log"
	"os"

	"codress/server/internal/config"
	"codress/server/internal/database"
	"codress/server/internal/router"

	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	cfg := config.Load()
	if err := os.MkdirAll(cfg.StorageDir, 0o755); err != nil {
		log.Fatalf("create storage dir: %v", err)
	}
	db, err := database.Open(cfg)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	r := router.New(db, cfg)
	log.Printf("[codress] api listening on :%s (driver=%s, storage=%s)", cfg.Port, cfg.DBDriver, cfg.StorageDir)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal(err)
	}
}
