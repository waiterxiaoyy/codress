package database

import (
	"database/sql"
	"fmt"
	"log"
	"regexp"

	"codress/server/internal/config"
	"codress/server/internal/model"

	"github.com/glebarez/sqlite"
	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// ensureMySQLDatabase 在 DSN 指定的数据库不存在时自动创建它。
func ensureMySQLDatabase(dsn string) error {
	// 从 DSN 中提取数据库名（/dbname? 部分）
	re := regexp.MustCompile(`/([^/?]+)\?`)
	m := re.FindStringSubmatch(dsn)
	if len(m) < 2 {
		return fmt.Errorf("cannot parse database name from DSN")
	}
	dbName := m[1]

	// 构造不含数据库名的 DSN（连接到 MySQL 默认库）
	noDB := re.ReplaceAllString(dsn, "/?")

	db, err := sql.Open("mysql", noDB)
	if err != nil {
		return err
	}
	defer db.Close()

	_, err = db.Exec(fmt.Sprintf(
		"CREATE DATABASE IF NOT EXISTS `%s` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci", dbName,
	))
	if err != nil {
		return fmt.Errorf("create database %q: %w", dbName, err)
	}
	log.Printf("[codress] database %q ready", dbName)
	return nil
}

func Open(cfg *config.Config) (*gorm.DB, error) {
	var dialector gorm.Dialector
	switch cfg.DBDriver {
	case "sqlite":
		dialector = sqlite.Open(cfg.DBDSN)
	case "mysql":
		if err := ensureMySQLDatabase(cfg.DBDSN); err != nil {
			return nil, fmt.Errorf("ensure database: %w", err)
		}
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
