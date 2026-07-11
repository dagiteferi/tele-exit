from app.domain.agents.synthesizer import Synthesizer
from app.domain.agents.types import AgentResult


def test_split_sentences():
    synth = Synthesizer()
    parts = synth.split_sentences("Hello there. How are you? Great!")
    assert parts == ["Hello there.", "How are you?", "Great!"]


def test_split_empty_and_whitespace():
    synth = Synthesizer()
    assert synth.split_sentences("   ") == []
    assert synth.split_sentences("") == []


def test_stream_and_tts_chunks():
    synth = Synthesizer()
    result = AgentResult(
        text="First sentence. Second sentence.",
        agent_used="curriculum",
    )
    streamed = list(synth.stream_sentences(result.text))
    assert streamed == ["First sentence.", "Second sentence."]

    chunks = synth.to_tts_chunks(result)
    assert chunks[0]["type"] == "agent_response_chunk"
    assert chunks[0]["index"] == 0
    assert chunks[1]["text"] == "Second sentence."
    assert chunks[1]["agent_used"] == "curriculum"


def test_synthesize_uses_result_text():
    synth = Synthesizer()
    assert synth.synthesize(AgentResult(text="Only one", agent_used="search")) == [
        "Only one"
    ]
