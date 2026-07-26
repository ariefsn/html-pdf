package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-faker/faker/v4"
)

type M map[string]interface{}

func badRequest(w http.ResponseWriter, what string, err error) {
	msg := what
	if err != nil {
		msg = fmt.Sprintf("%s: %v", what, err)
	}
	fmt.Println("[PDF] Bad request:", msg)
	http.Error(w, msg, http.StatusBadRequest)
}

func serverError(w http.ResponseWriter, what string, err error) {
	fmt.Printf("[PDF] Error: %s: %v\n", what, err)
	http.Error(w, fmt.Sprintf("%s: %v", what, err), http.StatusInternalServerError)
}

// resolveAlias prefers the alias the service sent, so filenames line up with
// the backend logs, then any ?alias= override, then a bare timestamp.
func resolveAlias(envelope, query string) string {
	suffix := time.Now().Format("20060102150405")

	name := strings.TrimSpace(envelope)
	if name == "" {
		name = strings.TrimSpace(query)
	}
	if name == "" {
		return suffix
	}

	// The alias arrives in a request body, so keep it to a bare filename --
	// a "../" would otherwise let a webhook write outside pdfs/.
	name = filepath.Base(name)
	if name == "." || name == ".." || name == string(filepath.Separator) {
		return suffix
	}

	return fmt.Sprintf("%s-%s", name, suffix)
}

func preparePath(alias string) (string, error) {
	if _, err := os.Stat("pdfs"); os.IsNotExist(err) {
		if err := os.Mkdir("pdfs", 0755); err != nil {
			return "", err
		}
	}
	return path.Join(".", "pdfs", alias+".pdf"), nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("HTML PDF client!"))
	})

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		// The service posts either a JSON envelope {alias, metadata, pdf} with
		// the pdf base64-encoded, or -- when webhookFormat is "multipart" --
		// a multipart body with a `meta` JSON part and a raw `pdf` part.
		var pdfBytes []byte
		var envelopeAlias string
		contentType := r.Header.Get("Content-Type")

		if strings.HasPrefix(contentType, "multipart/") {
			mr, err := r.MultipartReader()
			if err != nil {
				badRequest(w, "read multipart", err)
				return
			}

			// Stream the pdf part to a temp file instead of buffering it, so a
			// large document never has to sit in memory.
			tmp, err := os.CreateTemp("", "htmlpdf-*.pdf")
			if err != nil {
				serverError(w, "create temp file", err)
				return
			}
			tmpName := tmp.Name()
			defer os.Remove(tmpName)

			var written int64
			for {
				part, err := mr.NextPart()
				if err == io.EOF {
					break
				}
				if err != nil {
					tmp.Close()
					badRequest(w, "read part", err)
					return
				}

				switch part.FormName() {
				case "meta":
					var meta struct {
						Alias    string `json:"alias"`
						Metadata M      `json:"metadata"`
					}
					if err := json.NewDecoder(part).Decode(&meta); err != nil {
						part.Close()
						tmp.Close()
						badRequest(w, "decode meta", err)
						return
					}
					envelopeAlias = meta.Alias
				case "pdf":
					written, err = io.Copy(tmp, part)
					if err != nil {
						part.Close()
						tmp.Close()
						badRequest(w, "read pdf part", err)
						return
					}
				}
				part.Close()
			}
			tmp.Close()

			if written == 0 {
				badRequest(w, "empty pdf part", nil)
				return
			}

			alias := resolveAlias(envelopeAlias, r.URL.Query().Get("alias"))
			filePath, err := preparePath(alias)
			if err != nil {
				serverError(w, "prepare path", err)
				return
			}
			if err := os.Rename(tmpName, filePath); err != nil {
				// Rename fails across filesystems; fall back to a copy.
				if err := copyFile(tmpName, filePath); err != nil {
					serverError(w, "save pdf", err)
					return
				}
			}

			fmt.Printf("[PDF] Saved %s (%d bytes, multipart)\n", filePath, written)
			w.Write([]byte("PDF Generated! File Name: " + alias))
			return
		}

		// Default: JSON envelope with a base64 pdf.
		var payload struct {
			Alias    string `json:"alias"`
			Metadata M      `json:"metadata"`
			PDF      string `json:"pdf"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			badRequest(w, "decode json body", err)
			return
		}
		if payload.PDF == "" {
			badRequest(w, "missing pdf field", nil)
			return
		}

		pdfBytes, err := base64.StdEncoding.DecodeString(payload.PDF)
		if err != nil {
			badRequest(w, "decode base64 pdf", err)
			return
		}

		alias := resolveAlias(payload.Alias, r.URL.Query().Get("alias"))
		filePath, err := preparePath(alias)
		if err != nil {
			serverError(w, "prepare path", err)
			return
		}
		if err := os.WriteFile(filePath, pdfBytes, 0644); err != nil {
			serverError(w, "write pdf", err)
			return
		}

		fmt.Printf("[PDF] Saved %s (%d bytes, json)\n", filePath, len(pdfBytes))
		w.Write([]byte("PDF Generated! File Name: " + alias))
	})

	r.Get("/generate", func(w http.ResponseWriter, r *http.Request) {
		tmpPath := path.Join("templates", "hello.html")
		b, err := os.ReadFile(tmpPath)
		if err != nil {
			fmt.Println("[GEN] Error:", err)
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		genAddress := func() string {
			add := faker.GetRealAddress()

			return fmt.Sprintf("%s, %s, %s", add.Address, add.City, add.State)
		}

		tmpStr := string(b)
		values := M{
			"company": M{
				"name":    faker.DomainName(),
				"address": genAddress(),
				"phone":   faker.Phonenumber(),
			},
			"employee": M{
				"firstName": faker.FirstName(),
				"lastName":  faker.LastName(),
				"address":   genAddress(),
				"birthDate": faker.Date(),
				"tz":        faker.Timezone(),
				"contacts": []M{
					{
						"name":  "Username",
						"value": faker.Username(),
					},
					{
						"name":  "Phone",
						"value": faker.Phonenumber(),
					},
					{
						"name":  "Email",
						"value": faker.Email(),
					},
					{
						"name":  "Website",
						"value": faker.DomainName(),
					},
					{
						"name":  "Facebook",
						"value": faker.URL(),
					},
					{
						"name":  "Twitter",
						"value": faker.URL(),
					},
					{
						"name":  "LinkedIn",
						"value": faker.URL(),
					},
					{
						"name":  "Instagram",
						"value": faker.URL(),
					},
					{
						"name":  "Github",
						"value": faker.URL(),
					},
					{
						"name":  "Youtube",
						"value": faker.URL(),
					},
				},
			},
		}

		payload := M{
			"html":       tmpStr,
			"values":     values,
			"alias":      fmt.Sprintf("%s_%s", values["employee"].(M)["firstName"].(string), values["employee"].(M)["lastName"].(string)),
			"webhookUrl": "http://localhost:3002",
		}

		// ?format=multipart exercises the raw-bytes webhook instead of the
		// default base64 JSON one.
		if r.URL.Query().Get("format") == "multipart" {
			payload["webhookFormat"] = "multipart"
		}

		jsonStr, err := json.Marshal(payload)
		if err != nil {
			fmt.Println("[GEN] Error:", err)
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		req, err := http.NewRequest("POST", "http://localhost:3001/pdf", bytes.NewBuffer(jsonStr))
		if err != nil {
			fmt.Println("[GEN REQ] Error:", err)
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		req.Header.Add("Content-Type", "application/json")

		client := &http.Client{}
		res, err := client.Do(req)
		if err != nil {
			fmt.Println("[GEN API] Error:", err)
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		resM := M{}

		err = json.NewDecoder(res.Body).Decode(&resM)
		if err != nil {
			fmt.Println("[GEN RES] Error:", err)
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		resJson, _ := json.Marshal(resM)

		w.Write(resJson)
	})

	http.ListenAndServe(":3002", r)
}
