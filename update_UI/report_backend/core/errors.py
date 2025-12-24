class AgentError(Exception):
    """Base class for agent errors."""


class ConfigError(AgentError):
    pass


class StorageError(AgentError):
    pass


class LLMError(AgentError):
    pass


class ValidationError(AgentError):
    pass

