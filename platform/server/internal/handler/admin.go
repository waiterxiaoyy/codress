package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"codress/server/internal/auth"
	"codress/server/internal/config"
	"codress/server/internal/model"
	"codress/server/internal/storage"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

type Admin struct {
	DB  *gorm.DB
	Cfg *config.Config
}

func idParam(c *gin.Context) (uint, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil || id == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return 0, false
	}
	return uint(id), true
}

func toJSONField(value any) (datatypes.JSON, error) {
	if value == nil {
		return nil, nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return raw, nil
}

func validTargets(targets []string) bool {
	if len(targets) == 0 {
		return false
	}
	for _, t := range targets {
		if t != "codex" && t != "workbuddy" {
			return false
		}
	}
	return true
}

// ---- 登录 ----

func (h *Admin) Login(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var admin model.Admin
	if err := h.DB.Where("username = ?", input.Username).First(&admin).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(admin.PasswordHash), []byte(input.Password)) != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	token, err := auth.IssueToken(h.Cfg.JWTSecret, admin.ID, auth.RoleAdmin, admin.Username, 24*time.Hour)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "username": admin.Username})
}

func (h *Admin) Me(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"role": "admin"})
}

// ---- 皮肤管理 ----

type skinInput struct {
	Slug          string         `json:"slug"`
	Name          string         `json:"name"`
	Description   string         `json:"description"`
	Author        string         `json:"author"`
	Category      string         `json:"category"`
	Targets       []string       `json:"targets"`
	Appearance    string         `json:"appearance"`
	Art           map[string]any `json:"art"`
	Colors        map[string]any `json:"colors"`
	Tagline       string         `json:"tagline"`
	Quote         string         `json:"quote"`
	StatusText    string         `json:"statusText"`
	BrandSubtitle string         `json:"brandSubtitle"`
	ProjectPrefix string         `json:"projectPrefix"`
	ProjectLabel  string         `json:"projectLabel"`
	Sort          *int           `json:"sort"`
}

func (h *Admin) ListSkins(c *gin.Context) {
	page, pageSize := parsePage(c)
	query := h.DB.Model(&model.Skin{})
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Where("name LIKE ? OR slug LIKE ?", like, like)
	}
	var total int64
	query.Count(&total)
	var skins []model.Skin
	if err := query.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&skins).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	items := make([]gin.H, 0, len(skins))
	for i := range skins {
		view := skinView(h.Cfg, &skins[i])
		view["id"] = skins[i].ID
		view["createdAt"] = skins[i].CreatedAt
		items = append(items, view)
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Admin) CreateSkin(c *gin.Context) {
	var input skinInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !slugPattern.MatchString(input.Slug) || input.Name == "" || !validTargets(input.Targets) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug/name/targets invalid (targets: codex|workbuddy)"})
		return
	}
	if input.Appearance == "" {
		input.Appearance = "auto"
	}
	if input.Appearance != "auto" && input.Appearance != "light" && input.Appearance != "dark" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "appearance must be auto|light|dark"})
		return
	}
	targets, _ := toJSONField(input.Targets)
	art, _ := toJSONField(input.Art)
	colors, _ := toJSONField(input.Colors)
	skin := model.Skin{
		Slug: input.Slug, Name: input.Name, Description: input.Description,
		Author: input.Author, Category: input.Category, Targets: targets,
		Appearance: input.Appearance, Art: art, Colors: colors,
		Tagline: input.Tagline, Quote: input.Quote, StatusText: input.StatusText,
		BrandSubtitle: input.BrandSubtitle, ProjectPrefix: input.ProjectPrefix,
		ProjectLabel: input.ProjectLabel, Status: "draft",
	}
	if input.Sort != nil {
		skin.Sort = *input.Sort
	}
	if err := h.DB.Create(&skin).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "create failed (duplicate slug?): " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": skin.ID, "slug": skin.Slug})
}

func (h *Admin) UpdateSkin(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var skin model.Skin
	if err := h.DB.First(&skin, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skin not found"})
		return
	}
	var input skinInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Name != "" {
		skin.Name = input.Name
	}
	skin.Description = input.Description
	skin.Author = input.Author
	skin.Category = input.Category
	if input.Targets != nil {
		if !validTargets(input.Targets) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "targets invalid"})
			return
		}
		skin.Targets, _ = toJSONField(input.Targets)
	}
	if input.Appearance != "" {
		if input.Appearance != "auto" && input.Appearance != "light" && input.Appearance != "dark" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "appearance must be auto|light|dark"})
			return
		}
		skin.Appearance = input.Appearance
	}
	if input.Art != nil {
		skin.Art, _ = toJSONField(input.Art)
	}
	if input.Colors != nil {
		skin.Colors, _ = toJSONField(input.Colors)
	}
	skin.Tagline = input.Tagline
	skin.Quote = input.Quote
	skin.StatusText = input.StatusText
	if input.BrandSubtitle != "" {
		skin.BrandSubtitle = input.BrandSubtitle
	}
	skin.ProjectPrefix = input.ProjectPrefix
	skin.ProjectLabel = input.ProjectLabel
	if input.Sort != nil {
		skin.Sort = *input.Sort
	}
	if err := h.DB.Save(&skin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UploadSkinAssets 接收 multipart 字段 background / previewLight / previewDark。
func (h *Admin) UploadSkinAssets(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var skin model.Skin
	if err := h.DB.First(&skin, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skin not found"})
		return
	}
	subdir := "skins/" + skin.Slug
	uploaded := 0
	if fh, err := c.FormFile("background"); err == nil {
		rel, size, hash, err := storage.SaveUpload(h.Cfg.StorageDir, fh, subdir, "background")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "background: " + err.Error()})
			return
		}
		storage.Remove(h.Cfg.StorageDir, skin.Background)
		skin.Background, skin.SizeBytes, skin.Hash = rel, size, hash
		uploaded++
	}
	if fh, err := c.FormFile("previewLight"); err == nil {
		rel, _, _, err := storage.SaveUpload(h.Cfg.StorageDir, fh, subdir, "preview-light")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "previewLight: " + err.Error()})
			return
		}
		storage.Remove(h.Cfg.StorageDir, skin.PreviewLight)
		skin.PreviewLight = rel
		uploaded++
	}
	if fh, err := c.FormFile("previewDark"); err == nil {
		rel, _, _, err := storage.SaveUpload(h.Cfg.StorageDir, fh, subdir, "preview-dark")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "previewDark: " + err.Error()})
			return
		}
		storage.Remove(h.Cfg.StorageDir, skin.PreviewDark)
		skin.PreviewDark = rel
		uploaded++
	}
	if uploaded == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no file field found (background/previewLight/previewDark)"})
		return
	}
	if err := h.DB.Save(&skin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	view := skinView(h.Cfg, &skin)
	view["id"] = skin.ID
	c.JSON(http.StatusOK, view)
}

func (h *Admin) SetSkinStatus(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Status != "draft" && input.Status != "published" && input.Status != "offline" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be draft|published|offline"})
		return
	}
	var skin model.Skin
	if err := h.DB.First(&skin, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skin not found"})
		return
	}
	if input.Status == "published" && skin.Background == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot publish without a background image"})
		return
	}
	skin.Status = input.Status
	if err := h.DB.Save(&skin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "status": skin.Status})
}

func (h *Admin) DeleteSkin(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var skin model.Skin
	if err := h.DB.First(&skin, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "skin not found"})
		return
	}
	storage.Remove(h.Cfg.StorageDir, skin.Background)
	storage.Remove(h.Cfg.StorageDir, skin.PreviewLight)
	storage.Remove(h.Cfg.StorageDir, skin.PreviewDark)
	if err := h.DB.Delete(&skin).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- 宠物管理 ----

type petInput struct {
	Slug        string                 `json:"slug"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Category    string                 `json:"category"`
	Targets     []string               `json:"targets"`
	Animation   string                 `json:"animation"`
	StylePreset string                 `json:"stylePreset"`
	Tags        string                 `json:"tags"`
	Author      string                 `json:"author"`
	Manifest    map[string]interface{} `json:"manifest"` // Codex v2 pet.json 内容
	Sort        *int                   `json:"sort"`
}

func (h *Admin) ListPets(c *gin.Context) {
	page, pageSize := parsePage(c)
	query := h.DB.Model(&model.Pet{})
	if status := c.Query("status"); status != "" {
		query = query.Where("status = ?", status)
	}
	var total int64
	query.Count(&total)
	var pets []model.Pet
	if err := query.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&pets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	items := make([]gin.H, 0, len(pets))
	for i := range pets {
		view := petView(h.Cfg, &pets[i])
		view["id"] = pets[i].ID
		view["createdAt"] = pets[i].CreatedAt
		items = append(items, view)
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Admin) CreatePet(c *gin.Context) {
	var input petInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if !slugPattern.MatchString(input.Slug) || input.Name == "" || !validTargets(input.Targets) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "slug/name/targets invalid"})
		return
	}
	if input.Animation == "" {
		input.Animation = "idle"
	}
	if input.Animation != "idle" && input.Animation != "bounce" && input.Animation != "walk" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "animation must be idle|bounce|walk"})
		return
	}
	targets, _ := toJSONField(input.Targets)
	pet := model.Pet{
		Slug: input.Slug, Name: input.Name, Description: input.Description,
		Category: input.Category, Targets: targets, Animation: input.Animation, Status: "draft",
		StylePreset: input.StylePreset, Tags: input.Tags, Author: input.Author,
	}
	if input.Manifest != nil {
		manifestBytes, _ := json.Marshal(input.Manifest)
		pet.Manifest = manifestBytes
	}
	if input.Sort != nil {
		pet.Sort = *input.Sort
	}
	if err := h.DB.Create(&pet).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "create failed (duplicate slug?): " + err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": pet.ID, "slug": pet.Slug})
}

func (h *Admin) UpdatePet(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var pet model.Pet
	if err := h.DB.First(&pet, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "pet not found"})
		return
	}
	var input petInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Name != "" {
		pet.Name = input.Name
	}
	pet.Description = input.Description
	pet.Category = input.Category
	if input.Targets != nil {
		if !validTargets(input.Targets) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "targets invalid"})
			return
		}
		pet.Targets, _ = toJSONField(input.Targets)
	}
	if input.Animation != "" {
		if input.Animation != "idle" && input.Animation != "bounce" && input.Animation != "walk" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "animation must be idle|bounce|walk"})
			return
		}
		pet.Animation = input.Animation
	}
	if input.Sort != nil {
		pet.Sort = *input.Sort
	}
	if input.StylePreset != "" {
		pet.StylePreset = input.StylePreset
	}
	if input.Tags != "" {
		pet.Tags = input.Tags
	}
	if input.Author != "" {
		pet.Author = input.Author
	}
	if input.Manifest != nil {
		manifestBytes, _ := json.Marshal(input.Manifest)
		pet.Manifest = manifestBytes
	}
	if err := h.DB.Save(&pet).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *Admin) UploadPetAssets(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var pet model.Pet
	if err := h.DB.First(&pet, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "pet not found"})
		return
	}
	// 预览图 (image 字段)
	if fh, err := c.FormFile("image"); err == nil {
		rel, size, hash, err := storage.SaveUpload(h.Cfg.StorageDir, fh, "pets/"+pet.Slug, "pet")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		storage.Remove(h.Cfg.StorageDir, pet.Image)
		pet.Image, pet.SizeBytes, pet.Hash = rel, size, hash
	}
	// Sprite sheet (spritesheet 字段)
	if fh, err := c.FormFile("spritesheet"); err == nil {
		rel, size, hash, err := storage.SaveUpload(h.Cfg.StorageDir, fh, "pets/"+pet.Slug, "spritesheet")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "spritesheet upload failed: " + err.Error()})
			return
		}
		storage.Remove(h.Cfg.StorageDir, pet.SpriteSheet)
		pet.SpriteSheet = rel
		pet.SizeBytes = size
		pet.Hash = hash
	}
	if err := h.DB.Save(&pet).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	view := petView(h.Cfg, &pet)
	view["id"] = pet.ID
	c.JSON(http.StatusOK, view)
}

func (h *Admin) SetPetStatus(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Status != "draft" && input.Status != "published" && input.Status != "offline" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be draft|published|offline"})
		return
	}
	var pet model.Pet
	if err := h.DB.First(&pet, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "pet not found"})
		return
	}
	if input.Status == "published" && pet.Image == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot publish without an image"})
		return
	}
	pet.Status = input.Status
	if err := h.DB.Save(&pet).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "status": pet.Status})
}

func (h *Admin) DeletePet(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var pet model.Pet
	if err := h.DB.First(&pet, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "pet not found"})
		return
	}
	storage.Remove(h.Cfg.StorageDir, pet.Image)
	if err := h.DB.Delete(&pet).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- 分类 ----

func (h *Admin) ListCategories(c *gin.Context) {
	var categories []model.Category
	query := h.DB.Model(&model.Category{})
	if t := c.Query("type"); t != "" {
		query = query.Where("type = ?", t)
	}
	if err := query.Order("type ASC, sort ASC").Find(&categories).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": categories})
}

func (h *Admin) CreateCategory(c *gin.Context) {
	var input model.Category
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if (input.Type != "skin" && input.Type != "pet") || !slugPattern.MatchString(input.Slug) || input.Name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "type must be skin|pet, slug/name required"})
		return
	}
	input.ID = 0
	if err := h.DB.Create(&input).Error; err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, input)
}

func (h *Admin) UpdateCategory(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var category model.Category
	if err := h.DB.First(&category, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "category not found"})
		return
	}
	var input struct {
		Name string `json:"name"`
		Sort *int   `json:"sort"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Name != "" {
		category.Name = input.Name
	}
	if input.Sort != nil {
		category.Sort = *input.Sort
	}
	h.DB.Save(&category)
	c.JSON(http.StatusOK, category)
}

func (h *Admin) DeleteCategory(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	h.DB.Delete(&model.Category{}, id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- 适配器配置 ----

type adapterInput struct {
	AppID    string         `json:"appId"`
	Platform string         `json:"platform"`
	Version  *int           `json:"version"`
	Config   map[string]any `json:"config"`
	CSS      string         `json:"css"`
	Notes    string         `json:"notes"`
}

func (h *Admin) ListAdapters(c *gin.Context) {
	var adapters []model.AppAdapter
	if err := h.DB.Order("app_id ASC, version DESC").Find(&adapters).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": adapters})
}

func (h *Admin) CreateAdapter(c *gin.Context) {
	var input adapterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.AppID != "codex" && input.AppID != "workbuddy" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "appId must be codex|workbuddy"})
		return
	}
	if input.Platform == "" {
		input.Platform = "all"
	}
	if input.Platform != "all" && input.Platform != "win" && input.Platform != "mac" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "platform must be all|win|mac"})
		return
	}
	version := 1
	if input.Version != nil {
		version = *input.Version
	}
	configJSON, _ := toJSONField(input.Config)
	adapter := model.AppAdapter{
		AppID: input.AppID, Platform: input.Platform, Version: version,
		Config: configJSON, CSS: input.CSS, Notes: input.Notes, Status: "draft",
	}
	if err := h.DB.Create(&adapter).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, adapter)
}

func (h *Admin) UpdateAdapter(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var adapter model.AppAdapter
	if err := h.DB.First(&adapter, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "adapter not found"})
		return
	}
	var input adapterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Version != nil {
		adapter.Version = *input.Version
	}
	if input.Config != nil {
		adapter.Config, _ = toJSONField(input.Config)
	}
	adapter.CSS = input.CSS
	adapter.Notes = input.Notes
	if err := h.DB.Save(&adapter).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, adapter)
}

func (h *Admin) SetAdapterStatus(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	var input struct {
		Status string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || (input.Status != "draft" && input.Status != "active") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "status must be draft|active"})
		return
	}
	if err := h.DB.Model(&model.AppAdapter{}).Where("id = ?", id).Update("status", input.Status).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- 客户端版本 ----

func (h *Admin) ListReleases(c *gin.Context) {
	var releases []model.ClientRelease
	if err := h.DB.Order("id DESC").Find(&releases).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": releases})
}

func (h *Admin) CreateRelease(c *gin.Context) {
	var input model.ClientRelease
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if (input.Platform != "win" && input.Platform != "mac") || input.Version == "" || input.URL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "platform(win|mac)/version/url required"})
		return
	}
	input.ID = 0
	if err := h.DB.Create(&input).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, input)
}

func (h *Admin) DeleteRelease(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	h.DB.Delete(&model.ClientRelease{}, id)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ---- 用户与记录 ----

func (h *Admin) ListUsers(c *gin.Context) {
	page, pageSize := parsePage(c)
	query := h.DB.Model(&model.User{})
	if q := c.Query("q"); q != "" {
		like := "%" + q + "%"
		query = query.Where("name LIKE ? OR email LIKE ?", like, like)
	}
	var total int64
	query.Count(&total)
	var users []model.User
	if err := query.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": users, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Admin) UserEvents(c *gin.Context) {
	id, ok := idParam(c)
	if !ok {
		return
	}
	page, pageSize := parsePage(c)
	query := h.DB.Model(&model.UserEvent{}).Where("user_id = ?", id)
	var total int64
	query.Count(&total)
	var events []model.UserEvent
	if err := query.Order("id DESC").Offset((page - 1) * pageSize).Limit(pageSize).Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": events, "total": total, "page": page, "pageSize": pageSize})
}

func (h *Admin) ListTelemetry(c *gin.Context) {
	var events []model.TelemetryEvent
	if err := h.DB.Order("id DESC").Limit(200).Find(&events).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": events})
}

// ---- 看板 ----

func (h *Admin) StatsOverview(c *gin.Context) {
	var skinTotal, skinPublished, petTotal, petPublished, userTotal int64
	h.DB.Model(&model.Skin{}).Count(&skinTotal)
	h.DB.Model(&model.Skin{}).Where("status = ?", "published").Count(&skinPublished)
	h.DB.Model(&model.Pet{}).Count(&petTotal)
	h.DB.Model(&model.Pet{}).Where("status = ?", "published").Count(&petPublished)
	h.DB.Model(&model.User{}).Count(&userTotal)

	var skinDownloads, petDownloads int64
	h.DB.Model(&model.Skin{}).Select("COALESCE(SUM(downloads), 0)").Scan(&skinDownloads)
	h.DB.Model(&model.Pet{}).Select("COALESCE(SUM(downloads), 0)").Scan(&petDownloads)

	weekAgo := time.Now().AddDate(0, 0, -7)
	var telemetryTotal, telemetryPass int64
	h.DB.Model(&model.TelemetryEvent{}).Where("created_at > ?", weekAgo).Count(&telemetryTotal)
	h.DB.Model(&model.TelemetryEvent{}).Where("created_at > ? AND pass = ?", weekAgo, true).Count(&telemetryPass)

	type topItem struct {
		Slug      string `json:"slug"`
		Name      string `json:"name"`
		Downloads int64  `json:"downloads"`
	}
	var topSkins []topItem
	h.DB.Model(&model.Skin{}).Select("slug, name, downloads").
		Where("status = ?", "published").Order("downloads DESC").Limit(5).Scan(&topSkins)

	passRate := 1.0
	if telemetryTotal > 0 {
		passRate = float64(telemetryPass) / float64(telemetryTotal)
	}
	c.JSON(http.StatusOK, gin.H{
		"skins":             gin.H{"total": skinTotal, "published": skinPublished, "downloads": skinDownloads},
		"pets":              gin.H{"total": petTotal, "published": petPublished, "downloads": petDownloads},
		"users":             gin.H{"total": userTotal},
		"telemetry":         gin.H{"total7d": telemetryTotal, "pass7d": telemetryPass, "passRate7d": passRate},
		"topSkins":          topSkins,
	})
}
