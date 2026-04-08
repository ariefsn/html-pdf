.PHONY: tag-delete tag-push tag-repush

TAG ?= $(error TAG is required. Usage: make tag-push TAG=v1.0.0)

tag-delete:
	git tag -d $(TAG) && git push origin --delete $(TAG)

tag-push:
	git tag $(TAG) && git push origin $(TAG)

tag-repush:
	git tag -d $(TAG) && git push origin --delete $(TAG) && git tag $(TAG) && git push origin $(TAG)
