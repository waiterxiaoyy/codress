package database

import (
	"fmt"
	"log"

	"codress/server/internal/config"
	"codress/server/internal/model"

	"github.com/glebarez/sqlite"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Open(cfg *config.Config) (*gorm.DB, error) {
	var dialector gorm.Dialector
	switch cfg.DBDriver {
	case "sqlite":
		dialector = sqlite.Open(cfg.DBDSN)
	case "mysql":
		dialector = mysql.Open(cfg.DBDSN)
	default:
		return nil, fmt.Errorf("unsupported DB_DRIVER: %s", cfg.DBDriver)
	}
	db, err := gorm.Open(dialector, &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	if err := db.AutoMigrate(
		&model.Admin{}, &model.User{}, &model.Category{},
		&model.Skin{}, &model.Pet{},
		&model.AppAdapter{}, &model.ClientRelease{},
		&model.UserEvent{}, &model.Favorite{}, &model.TelemetryEvent{},
	); err != nil {
		return nil, fmt.Errorf("auto migrate: %w", err)
	}
	if err := seed(db, cfg); err != nil {
		return nil, err
	}
	return db, nil
}

func seed(db *gorm.DB, cfg *config.Config) error {
	var adminCount int64
	if err := db.Model(&model.Admin{}).Count(&adminCount).Error; err != nil {
		return err
	}
	if adminCount == 0 {
		hash, err := bcrypt.GenerateFromPassword([]byte(cfg.AdminPassword), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if err := db.Create(&model.Admin{Username: cfg.AdminUsername, PasswordHash: string(hash)}).Error; err != nil {
			return err
		}
		log.Printf("[codress] seeded default admin %q (change the password in production)", cfg.AdminUsername)
	}

	var categoryCount int64
	if err := db.Model(&model.Category{}).Count(&categoryCount).Error; err != nil {
		return err
	}
	if categoryCount == 0 {
		defaults := []model.Category{
			{Type: "skin", Slug: "minimal", Name: "极简", Sort: 10},
			{Type: "skin", Slug: "scifi", Name: "科幻", Sort: 20},
			{Type: "skin", Slug: "anime", Name: "二次元", Sort: 30},
			{Type: "skin", Slug: "illustration", Name: "插画", Sort: 40},
			{Type: "skin", Slug: "demo", Name: "演示", Sort: 90},
			{Type: "pet", Slug: "pixel", Name: "像素", Sort: 10},
			{Type: "pet", Slug: "animal", Name: "动物", Sort: 20},
		}
		if err := db.Create(&defaults).Error; err != nil {
			return err
		}
	}
	return nil
}
