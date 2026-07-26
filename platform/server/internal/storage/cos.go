package storage

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tencentyun/cos-go-sdk-v5"
)

// COS 直传模式:ConfigureCOS 成功后,SaveBytes/Remove 不再落本地磁盘,
// 而是以相对路径为对象键写入桶(桶为公有读,资产 URL = 桶域名 + / + 键)。
var cosClient *cos.Client

// ConfigureCOS 启用 COS 模式;bucketURL 为空表示维持本地磁盘模式,返回 nil。
func ConfigureCOS(bucketURL, secretID, secretKey string) error {
	if bucketURL == "" {
		return nil
	}
	parsed, err := url.Parse(bucketURL)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("invalid COS_BUCKET_URL: %q", bucketURL)
	}
	if secretID == "" || secretKey == "" {
		return fmt.Errorf("COS_BUCKET_URL is set but COS_SECRET_ID/COS_SECRET_KEY is empty")
	}
	cosClient = cos.NewClient(&cos.BaseURL{BucketURL: parsed}, &http.Client{
		Timeout: 60 * time.Second,
		Transport: &cos.AuthorizationTransport{
			SecretID:  secretID,
			SecretKey: secretKey,
		},
	})
	return nil
}

func COSEnabled() bool { return cosClient != nil }

var contentTypes = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
}

func cosPut(key string, data []byte, ext string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	_, err := cosClient.Object.Put(ctx, key, bytes.NewReader(data), &cos.ObjectPutOptions{
		ObjectPutHeaderOptions: &cos.ObjectPutHeaderOptions{
			ContentType: contentTypes[strings.ToLower(ext)],
			// 文件名带内容哈希,内容不可变,可放心长缓存
			CacheControl: "public, max-age=31536000, immutable",
		},
	})
	if err != nil {
		return fmt.Errorf("cos put %s: %w", key, err)
	}
	return nil
}

func cosRemove(key string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_, _ = cosClient.Object.Delete(ctx, key)
}
