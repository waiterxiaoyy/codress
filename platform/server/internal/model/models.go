package model

import (
	"time"

	"gorm.io/datatypes"
)

type Admin struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Username     string    `gorm:"size:64;uniqueIndex" json:"username"`
	PasswordHash string    `gorm:"size:255" json:"-"`
	CreatedAt    time.Time `json:"createdAt"`
}

// User 终端用户,来自 GitHub/Google OAuth 或开发登录;体系以"记录"为主。
type User struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	Provider    string    `gorm:"size:16;uniqueIndex:idx_provider_uid" json:"provider"` // github | google | dev
	ProviderUID string    `gorm:"size:128;uniqueIndex:idx_provider_uid" json:"providerUid"`
	Email       string    `gorm:"size:255" json:"email"`
	Name        string    `gorm:"size:128" json:"name"`
	AvatarURL   string    `gorm:"size:512" json:"avatarUrl"`
	LastLoginAt time.Time `json:"lastLoginAt"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Category struct {
	ID   uint   `gorm:"primaryKey" json:"id"`
	Type string `gorm:"size:8;uniqueIndex:idx_type_slug" json:"type"` // skin | pet
	Slug string `gorm:"size:64;uniqueIndex:idx_type_slug" json:"slug"`
	Name string `gorm:"size:64" json:"name"`
	Sort int    `json:"sort"`
}

type Skin struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	Slug         string         `gorm:"size:80;uniqueIndex" json:"slug"`
	Name         string         `gorm:"size:80" json:"name"`
	Description  string         `gorm:"size:400" json:"description"`
	Author       string         `gorm:"size:80" json:"author"`
	Category     string         `gorm:"size:64;index" json:"category"`
	Targets      datatypes.JSON `json:"targets"` // ["codex","workbuddy"]
	Appearance   string         `gorm:"size:8;default:auto" json:"appearance"`
	Art          datatypes.JSON `json:"art"`
	Colors       datatypes.JSON `json:"colors"`
	Background   string         `gorm:"size:255" json:"background"`
	PreviewLight string         `gorm:"size:255" json:"previewLight"`
	PreviewDark  string         `gorm:"size:255" json:"previewDark"`
	SizeBytes    int64          `json:"sizeBytes"`
	Hash         string         `gorm:"size:64" json:"hash"`
	Status       string         `gorm:"size:16;default:draft;index" json:"status"` // draft | published | offline
	Downloads    int64          `json:"downloads"`
	Sort         int            `json:"sort"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
}

// Pet 桌面宠物,与皮肤平行的资源。
type Pet struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	Slug        string         `gorm:"size:80;uniqueIndex" json:"slug"`
	Name        string         `gorm:"size:80" json:"name"`
	Description string         `gorm:"size:400" json:"description"`
	Category    string         `gorm:"size:64;index" json:"category"`
	Targets     datatypes.JSON `json:"targets"`
	Image       string         `gorm:"size:255" json:"image"`
	Animation   string         `gorm:"size:16;default:idle" json:"animation"` // idle | bounce | walk
	SizeBytes   int64          `json:"sizeBytes"`
	Hash        string         `gorm:"size:64" json:"hash"`
	Status      string         `gorm:"size:16;default:draft;index" json:"status"`
	Downloads   int64          `json:"downloads"`
	Sort        int            `json:"sort"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

// AppAdapter 客户端注入适配器的远程配置,可热下发修复目标应用更新导致的失配。
type AppAdapter struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	AppID     string         `gorm:"size:32;index" json:"appId"` // codex | workbuddy
	Platform  string         `gorm:"size:8;default:all" json:"platform"`
	Version   int            `json:"version"`
	Config    datatypes.JSON `json:"config"`
	CSS       string         `gorm:"type:longtext" json:"css"`
	Notes     string         `gorm:"size:255" json:"notes"`
	Status    string         `gorm:"size:16;default:draft" json:"status"` // draft | active
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

type ClientRelease struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Platform  string    `gorm:"size:8;index" json:"platform"` // win | mac
	Version   string    `gorm:"size:32" json:"version"`
	URL       string    `gorm:"size:512" json:"url"`
	Notes     string    `gorm:"size:1000" json:"notes"`
	Mandatory bool      `json:"mandatory"`
	CreatedAt time.Time `json:"createdAt"`
}

// UserEvent 用户行为记录(下载/应用/收藏/登录),用户体系的核心诉求。
type UserEvent struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index" json:"userId"`
	Action    string         `gorm:"size:16;index" json:"action"`   // download | apply | remove | favorite | unfavorite | login
	ItemType  string         `gorm:"size:8" json:"itemType"`        // skin | pet | app
	ItemSlug  string         `gorm:"size:80;index" json:"itemSlug"`
	Target    string         `gorm:"size:32" json:"target"` // codex | workbuddy
	Meta      datatypes.JSON `json:"meta"`
	CreatedAt time.Time      `json:"createdAt"`
}

type Favorite struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"uniqueIndex:idx_user_item" json:"userId"`
	ItemType  string    `gorm:"size:8;uniqueIndex:idx_user_item" json:"itemType"`
	ItemSlug  string    `gorm:"size:80;uniqueIndex:idx_user_item" json:"itemSlug"`
	CreatedAt time.Time `json:"createdAt"`
}

// TelemetryEvent 客户端 verify 匿名上报,用于监控目标应用更新导致的皮肤失效。
type TelemetryEvent struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	AppID          string    `gorm:"size:32;index" json:"appId"`
	AppVersion     string    `gorm:"size:32" json:"appVersion"`
	AdapterVersion string    `gorm:"size:32" json:"adapterVersion"`
	SkinSlug       string    `gorm:"size:80" json:"skinSlug"`
	ClientVersion  string    `gorm:"size:32" json:"clientVersion"`
	OS             string    `gorm:"size:16" json:"os"`
	Pass           bool      `gorm:"index" json:"pass"`
	Message        string    `gorm:"size:500" json:"message"`
	CreatedAt      time.Time `json:"createdAt"`
}
