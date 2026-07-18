package server

import "testing"

func TestParseStorageList(t *testing.T) {
	out := ".torsor/storage/logo.png\t245000\t1700000000\n" +
		".torsor/storage/assets/hero.jpg\t1200000\t1699999999\n" +
		".torsor/storage/data.csv\t45000\t1699000000\n"
	items := parseStorageList(out)
	if len(items) != 3 {
		t.Fatalf("items = %d, want 3", len(items))
	}
	if items[0].ID != "logo.png" || items[0].Name != "logo.png" {
		t.Fatalf("item0 id/name = %q/%q", items[0].ID, items[0].Name)
	}
	if items[0].Type != "image" {
		t.Fatalf("logo.png type = %q, want image", items[0].Type)
	}
	if items[0].Size != 245000 {
		t.Fatalf("size = %d, want 245000", items[0].Size)
	}
	if items[0].UploadedAt != 1700000000*1000 {
		t.Fatalf("uploadedAt = %d, want ms", items[0].UploadedAt)
	}
	if items[0].Path != "/" {
		t.Fatalf("logo.png path = %q, want /", items[0].Path)
	}
	if items[1].ID != "assets/hero.jpg" || items[1].Path != "/assets" {
		t.Fatalf("nested item = %+v", items[1])
	}
	if items[2].Type != "document" {
		t.Fatalf("data.csv type = %q, want document", items[2].Type)
	}
}

func TestStorageRel(t *testing.T) {
	if p, ok := storageRel("logo.png"); !ok || p != ".torsor/storage/logo.png" {
		t.Fatalf("storageRel(logo.png) = %q,%v", p, ok)
	}
	if p, ok := storageRel("/assets/x.png"); !ok || p != ".torsor/storage/assets/x.png" {
		t.Fatalf("storageRel(/assets/x.png) = %q,%v", p, ok)
	}
	for _, bad := range []string{"", "..", "../etc/passwd", "a/../../b", "/../x"} {
		if _, ok := storageRel(bad); ok {
			t.Fatalf("storageRel(%q) should be rejected", bad)
		}
	}
}

func TestStorageType(t *testing.T) {
	cases := map[string]string{
		"a.png": "image", "b.MP4": "video", "c.pdf": "document", "d.bin": "other", "noext": "other",
	}
	for name, want := range cases {
		if got := storageType(name); got != want {
			t.Fatalf("storageType(%q) = %q, want %q", name, got, want)
		}
	}
}
