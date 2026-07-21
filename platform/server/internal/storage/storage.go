package storage

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
)

const MaxImageBytes = 16 << 20 // 与注入运行时的 16MB 上限一致

var allowedExt = map[string]bool{".png": true, ".jpg": true, ".jpeg": true, ".webp": true}
var safeSegment = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,79}$`)

// SaveUpload 把上传文件落盘到 <root>/<subdir>/<base>-<hash8><ext>,返回正斜杠相对路径。
func SaveUpload(root string, fh *multipart.FileHeader, subdir, base string) (rel string, size int64, hashHex string, err error) {
	if fh.Size <= 0 || fh.Size > MaxImageBytes {
		return "", 0, "", fmt.Errorf("file size must be 1..%d bytes", MaxImageBytes)
	}
	ext := strings.ToLower(filepath.Ext(fh.Filename))
	if !allowedExt[ext] {
		return "", 0, "", fmt.Errorf("unsupported file type: %s", ext)
	}
	file, err := fh.Open()
	if err != nil {
		return "", 0, "", err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, MaxImageBytes+1))
	if err != nil {
		return "", 0, "", err
	}
	if int64(len(data)) > MaxImageBytes {
		return "", 0, "", errors.New("file exceeds the 16MB limit")
	}
	return SaveBytes(root, data, subdir, base, ext)
}

// SaveBytes 供 seed 等内部路径复用。
func SaveBytes(root string, data []byte, subdir, base, ext string) (rel string, size int64, hashHex string, err error) {
	if !allowedExt[strings.ToLower(ext)] {
		return "", 0, "", fmt.Errorf("unsupported file type: %s", ext)
	}
	for _, segment := range strings.Split(subdir, "/") {
		if !safeSegment.MatchString(segment) {
			return "", 0, "", fmt.Errorf("unsafe path segment: %q", segment)
		}
	}
	if !safeSegment.MatchString(base) {
		return "", 0, "", fmt.Errorf("unsafe file base name: %q", base)
	}
	sum := sha256.Sum256(data)
	hashHex = hex.EncodeToString(sum[:])
	name := fmt.Sprintf("%s-%s%s", base, hashHex[:8], strings.ToLower(ext))
	dir := filepath.Join(root, filepath.FromSlash(subdir))
	if err = os.MkdirAll(dir, 0o755); err != nil {
		return "", 0, "", err
	}
	full := filepath.Join(dir, name)
	if err = os.WriteFile(full, data, 0o644); err != nil {
		return "", 0, "", err
	}
	return path.Join(subdir, name), int64(len(data)), hashHex, nil
}

// Remove 删除相对路径指向的文件(best effort,拒绝越出 root)。
func Remove(root, rel string) {
	if rel == "" {
		return
	}
	full := filepath.Join(root, filepath.FromSlash(rel))
	cleanRoot, err1 := filepath.Abs(root)
	cleanFull, err2 := filepath.Abs(full)
	if err1 != nil || err2 != nil {
		return
	}
	if !strings.HasPrefix(cleanFull, cleanRoot+string(os.PathSeparator)) {
		return
	}
	_ = os.Remove(cleanFull)
}
