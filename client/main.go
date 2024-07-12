package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-faker/faker/v4"
)

type M map[string]interface{}

func main() {
	r := chi.NewRouter()
	r.Use(middleware.Logger)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("HTML PDF client!"))
	})

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		var buff bytes.Buffer

		query := r.URL.Query()
		alias := query.Get("alias") // get alias from query string if any
		t := time.Now()
		suffix := t.Format("20060102150405")
		if alias == "" {
			alias = suffix
		} else {
			alias = fmt.Sprintf("%s-%s", alias, suffix)
		}

		_, err := buff.ReadFrom(r.Body) // read request body as buffer

		if err != nil {
			fmt.Println("[PDF] Error:", err)
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

		// check dir exists
		if _, err := os.Stat("pdfs"); os.IsNotExist(err) {
			err = os.Mkdir("pdfs", 0755)
			if err != nil {
				fmt.Println("[PDF] Error:", err)
				w.WriteHeader(500)
				w.Write([]byte(err.Error()))
				return
			}
		}

		filePath := path.Join(".", "pdfs", alias+".pdf") // prepare file path

		err = os.WriteFile(filePath, buff.Bytes(), 0644) // write buffer to file
		if err != nil {
			fmt.Println("[PDF] Error:", err)
			w.WriteHeader(500)
			w.Write([]byte(err.Error()))
			return
		}

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
			"html":   tmpStr,
			"values": values,
			"alias":  fmt.Sprintf("%s_%s", values["employee"].(M)["firstName"].(string), values["employee"].(M)["lastName"].(string)),
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
