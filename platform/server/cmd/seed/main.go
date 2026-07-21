// seed 命令:把目录里的图片批量导入为已发布的皮肤/宠物,便于本地一键出 Demo 数据。
// 用法: go run ./cmd/seed -assets ../deploy/seed
// 目录约定: <assets>/skins/*.jpg|png|webp → 皮肤; <assets>/pets/*.png → 宠物。
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"codress/server/internal/config"
	"codress/server/internal/database"
	"codress/server/internal/model"
	"codress/server/internal/storage"

	"github.com/joho/godotenv"
	"gorm.io/datatypes"
)

func slugify(name string) string {
	s := strings.ToLower(strings.TrimSuffix(name, filepath.Ext(name)))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		} else if b.Len() > 0 && !strings.HasSuffix(b.String(), "-") {
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "item"
	}
	return out
}

func titleCase(slug string) string {
	words := strings.Split(strings.ReplaceAll(slug, "-", " "), " ")
	for i, w := range words {
		if w != "" {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}
	return strings.Join(words, " ")
}

func mustJSON(v any) datatypes.JSON {
	raw, err := json.Marshal(v)
	if err != nil {
		log.Fatal(err)
	}
	return raw
}

func main() {
	_ = godotenv.Load()
	assets := flag.String("assets", "../deploy/seed", "seed assets directory")
	flag.Parse()
	cfg := config.Load()
	if err := os.MkdirAll(cfg.StorageDir, 0o755); err != nil {
		log.Fatal(err)
	}
	db, err := database.Open(cfg)
	if err != nil {
		log.Fatal(err)
	}

	imported := 0
	skinDir := filepath.Join(*assets, "skins")
	entries, _ := os.ReadDir(skinDir)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
			continue
		}
		slug := slugify(entry.Name())
		data, err := os.ReadFile(filepath.Join(skinDir, entry.Name()))
		if err != nil {
			log.Printf("skip %s: %v", entry.Name(), err)
			continue
		}
		rel, size, hash, err := storage.SaveBytes(cfg.StorageDir, data, "skins/"+slug, "background", ext)
		if err != nil {
			log.Printf("skip %s: %v", entry.Name(), err)
			continue
		}
		skin := model.Skin{
			Slug: slug, Name: titleCase(slug),
			Description: "演示皮肤(seed 导入)", Author: "codress",
			Category: "demo", Targets: mustJSON([]string{"codex", "workbuddy"}),
			Appearance: "auto", Background: rel, SizeBytes: size, Hash: hash,
			Status: "published",
		}
		if err := db.Where("slug = ?", slug).FirstOrCreate(&skin).Error; err != nil {
			log.Printf("skin %s: %v", slug, err)
			continue
		}
		db.Model(&skin).Updates(map[string]any{
			"background": rel, "size_bytes": size, "hash": hash, "status": "published",
		})
		imported++
		fmt.Printf("skin  %-24s -> %s\n", slug, rel)
	}

	petDir := filepath.Join(*assets, "pets")
	entries, _ = os.ReadDir(petDir)
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if ext != ".png" && ext != ".webp" {
			continue
		}
		slug := slugify(entry.Name())
		data, err := os.ReadFile(filepath.Join(petDir, entry.Name()))
		if err != nil {
			log.Printf("skip %s: %v", entry.Name(), err)
			continue
		}
		rel, size, hash, err := storage.SaveBytes(cfg.StorageDir, data, "pets/"+slug, "pet", ext)
		if err != nil {
			log.Printf("skip %s: %v", entry.Name(), err)
			continue
		}
		pet := model.Pet{
			Slug: slug, Name: titleCase(slug),
			Description: "演示宠物(seed 导入)", Category: "pixel",
			Targets: mustJSON([]string{"codex"}), Animation: "bounce",
			Image: rel, SizeBytes: size, Hash: hash, Status: "published",
		}
		if err := db.Where("slug = ?", slug).FirstOrCreate(&pet).Error; err != nil {
			log.Printf("pet %s: %v", slug, err)
			continue
		}
		db.Model(&pet).Updates(map[string]any{
			"image": rel, "size_bytes": size, "hash": hash, "status": "published",
		})
		imported++
		fmt.Printf("pet   %-24s -> %s\n", slug, rel)
	}
	fmt.Printf("seed done: %d items imported\n", imported)
}
