from pydantic import BaseModel


def forbid_null(instance: BaseModel, fields: set[str]) -> None:
    """Update schemas across this app deliberately use exclude_unset (not
    exclude_none) so an explicit null can clear a genuinely-optional field --
    but some fields are required (non-Optional) in the corresponding *Out
    response schema. Writing null to one of those doesn't fail quietly: it
    500s the NEXT list/get call for every user, since FastAPI's response-
    model validation rejects the whole row (or the whole list, for a
    list-response endpoint) the moment one required field is missing. Call
    this from a model_validator(mode="after") with the set of fields that
    are required in this schema's *Out counterpart, to reject the null at
    the door instead."""
    for field in fields & instance.model_fields_set:
        if getattr(instance, field) is None:
            raise ValueError(f"'{field}' is required and cannot be cleared to null")
