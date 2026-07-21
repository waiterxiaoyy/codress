// seed 命令:把目录里的图片批量导入为已发布的皮肤/宠物,便于本地一键出 Demo 数据。
// 用法: go run ./cmd/seed -assets ../deploy/seed
// 目录约定:
//
//	<assets>/skins/<slug>.jpg|png|webp   → Codex/通用皮肤背景图
//	<assets>/skins/<slug>.json           → 可选元数据(name/tagline/colors/art 等)
//	<assets>/workbuddy/catalog.json      → WorkBuddy 多主题目录（含 themes 数组）
//	<assets>/workbuddy/<image>.jpg       → WorkBuddy 背景图（被 catalog 引用）
//	<assets>/pets/<slug>.png             → 宠物图
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

// skinMeta 对应 seed/<slug>.json 的结构，完整对齐 skill theme.json 规则。
type skinMeta struct {
	Name          string            `json:"name"`
	Category      string            `json:"category"`
	Tagline       string            `json:"tagline"`
	Quote         string            `json:"quote"`
	StatusText    string            `json:"statusText"`
	BrandSubtitle string            `json:"brandSubtitle"`
	Appearance    string            `json:"appearance"`
	Art           map[string]any    `json:"art"`
	Colors        map[string]string `json:"colors"`
}

// wbCatalog 对应 workbuddy/catalog.json 的顶层结构。
type wbCatalog struct {
	SchemaVersion  int         `json:"schemaVersion"`
	DefaultThemeID string      `json:"defaultThemeId"`
	Themes         []wbTheme   `json:"themes"`
}

// wbTheme 对应 catalog 里每一套主题。
type wbTheme struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Emoji       string            `json:"emoji"`
	Appearance  string            `json:"appearance"`
	Effects     string            `json:"effects"`
	Description string            `json:"description"`
	Tagline     string            `json:"tagline"`
	StatusText  string            `json:"statusText"`
	Image       string            `json:"image"`
	Colors      map[string]string `json:"colors"`
}

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

// loadSkinMeta 尝试读取同名 .json 元数据文件，不存在则返回 nil。
func loadSkinMeta(dir, slug string) *skinMeta {
	data, err := os.ReadFile(filepath.Join(dir, slug+".json"))
	if err != nil {
		return nil
	}
	var meta skinMeta
	if err := json.Unmarshal(data, &meta); err != nil {
		log.Printf("warn: %s.json parse error: %v", slug, err)
		return nil
	}
	return &meta
}

func strOr(s, fallback string) string {
	if strings.TrimSpace(s) != "" {
		return s
	}
	return fallback
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

		// 读取元数据（有则用，无则用默认值）
		meta := loadSkinMeta(skinDir, slug)

		name := titleCase(slug)
		category := "demo"
		tagline := ""
		quote := ""
		statusText := ""
		brandSubtitle := ""
		appearance := "auto"
		var artJSON datatypes.JSON
		var colorsJSON datatypes.JSON

		if meta != nil {
			name = strOr(meta.Name, name)
			category = strOr(meta.Category, category)
			tagline = meta.Tagline
			quote = meta.Quote
			statusText = meta.StatusText
			brandSubtitle = meta.BrandSubtitle
			appearance = strOr(meta.Appearance, appearance)
			if meta.Art != nil {
				artJSON = mustJSON(meta.Art)
			}
			if meta.Colors != nil {
				colorsJSON = mustJSON(meta.Colors)
			}
		}

		skin := model.Skin{
			Slug:          slug,
			Name:          name,
			Description:   tagline,
			Author:        "codress",
			Category:      category,
			Targets:       mustJSON([]string{"codex", "workbuddy"}),
			Appearance:    appearance,
			Tagline:       tagline,
			Quote:         quote,
			StatusText:    statusText,
			BrandSubtitle: brandSubtitle,
			Art:           artJSON,
			Colors:        colorsJSON,
			Background:    rel,
			SizeBytes:     size,
			Hash:          hash,
			Status:        "published",
		}
		if err := db.Where("slug = ?", slug).FirstOrCreate(&skin).Error; err != nil {
			log.Printf("skin %s: %v", slug, err)
			continue
		}
		db.Model(&skin).Updates(map[string]any{
			"name": name, "category": category,
			"tagline": tagline, "quote": quote,
			"status_text": statusText, "brand_subtitle": brandSubtitle,
			"appearance": appearance, "art": artJSON, "colors": colorsJSON,
			"background": rel, "size_bytes": size, "hash": hash, "status": "published",
		})
		imported++
		fmt.Printf("skin  %-28s -> %s\n", slug, rel)
	}

	petDir := filepath.Join(*assets, "pets")
	// ---- WorkBuddy catalog 导入 ----
	// workbuddy/ 目录下有 catalog.json + 对应图片，每个 theme 独立成一套皮肤。
	wbDir := filepath.Join(*assets, "workbuddy")
	catalogPath := filepath.Join(wbDir, "catalog.json")
	if catalogData, err := os.ReadFile(catalogPath); err == nil {
		var cat wbCatalog
		if err := json.Unmarshal(catalogData, &cat); err == nil {
			for _, theme := range cat.Themes {
				slug := "wb-" + theme.ID
				imgFile := filepath.Join(wbDir, theme.Image)
				imgData, err := os.ReadFile(imgFile)
				if err != nil {
					log.Printf("wb skip %s: image %s not found: %v", theme.ID, theme.Image, err)
					continue
				}
				ext := strings.ToLower(filepath.Ext(theme.Image))
				rel, size, hash, err := storage.SaveBytes(cfg.StorageDir, imgData, "skins/"+slug, "background", ext)
				if err != nil {
					log.Printf("wb skip %s: %v", slug, err)
					continue
				}
				appearance := theme.Appearance
				if appearance == "" {
					appearance = "dark"
				}
				colorsJSON := mustJSON(theme.Colors)
				skin := model.Skin{
					Slug:       slug,
					Name:       theme.Name,
					Description: theme.Description,
					Author:     "codress",
					Category:   "demo",
					Targets:    mustJSON([]string{"workbuddy"}),
					Appearance: appearance,
					Tagline:    theme.Tagline,
					StatusText: theme.StatusText,
					Colors:     colorsJSON,
					Background: rel,
					SizeBytes:  size,
					Hash:       hash,
					Status:     "published",
				}
				if err := db.Where("slug = ?", slug).FirstOrCreate(&skin).Error; err != nil {
					log.Printf("wb skin %s: %v", slug, err)
					continue
				}
				db.Model(&skin).Updates(map[string]any{
					"name": theme.Name, "description": theme.Description,
					"tagline": theme.Tagline, "status_text": theme.StatusText,
					"appearance": appearance, "colors": colorsJSON,
					"background": rel, "size_bytes": size, "hash": hash, "status": "published",
				})
				imported++
				fmt.Printf("wb    %-28s -> %s\n", slug, rel)
			}
		} else {
			log.Printf("warn: workbuddy/catalog.json parse error: %v", err)
		}
	}

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
		fmt.Printf("pet   %-28s -> %s\n", slug, rel)
	}

	// ---- 从 pet-seeds.json 导入 v2 宠物（含 spritesheet + manifest）----
	petSeedsPath := filepath.Join(filepath.Dir(*assets), "pet-seeds.json")
	if data, err := os.ReadFile(petSeedsPath); err == nil {
		var petSeeds []struct {
			Slug        string                 `json:"slug"`
			Name        string                 `json:"name"`
			Description string                 `json:"description"`
			Category    string                 `json:"category"`
			Targets     []string               `json:"targets"`
			Image       string                 `json:"image"`
			SpriteSheet string                 `json:"spriteSheet"`
			Animation   string                 `json:"animation"`
			StylePreset string                 `json:"stylePreset"`
			Tags        string                 `json:"tags"`
			Author      string                 `json:"author"`
			Manifest    map[string]interface{} `json:"manifest"`
			Status      string                 `json:"status"`
		}
		if err := json.Unmarshal(data, &petSeeds); err == nil {
			for _, ps := range petSeeds {
				manifestBytes, _ := json.Marshal(ps.Manifest)
				pet := model.Pet{
					Slug:        ps.Slug,
					Name:        ps.Name,
					Description: ps.Description,
					Category:    ps.Category,
					Targets:     mustJSON(ps.Targets),
					Image:       ps.Image,
					SpriteSheet: ps.SpriteSheet,
					Animation:   ps.Animation,
					StylePreset: ps.StylePreset,
					Tags:        ps.Tags,
					Author:      ps.Author,
					Manifest:    datatypes.JSON(manifestBytes),
					Status:      ps.Status,
				}
				if err := db.Where("slug = ?", ps.Slug).FirstOrCreate(&pet).Error; err != nil {
					log.Printf("pet-seed %s: %v", ps.Slug, err)
					continue
				}
				db.Model(&pet).Updates(map[string]any{
					"name": ps.Name, "description": ps.Description,
					"category": ps.Category, "targets": mustJSON(ps.Targets),
					"image": ps.Image, "sprite_sheet": ps.SpriteSheet,
					"animation": ps.Animation, "style_preset": ps.StylePreset,
					"tags": ps.Tags, "author": ps.Author,
					"manifest": datatypes.JSON(manifestBytes),
					"status": ps.Status,
				})
				imported++
				fmt.Printf("pet-v2 %-26s -> %s\n", ps.Slug, ps.SpriteSheet)
			}
		} else {
			log.Printf("warn: pet-seeds.json parse error: %v", err)
		}
	}

	fmt.Printf("seed done: %d items imported\n", imported)
}
