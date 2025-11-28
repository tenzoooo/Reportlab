import re
from dataclasses import dataclass

@dataclass
class SplitContexts:
    full_text: str
    method_text: str
    discussion_text: str

class SmartSplitter:
    def __init__(self):
        pass

    def split(self, full_text: str) -> SplitContexts:
        """
        Splits the full text into Method, Discussion, and Full Contexts using Regex.
        """
        method_text = self._extract_method_section(full_text)
        discussion_text = self._extract_discussion_section(full_text)
        
        return SplitContexts(
            full_text=full_text,
            method_text=method_text,
            discussion_text=discussion_text
        )

    def _extract_method_section(self, text: str) -> str:
        # v2 Spec: r'^4\.\s*実験方法' to r'^5\.' or r'^6\.'
        
        # Pattern 1: Strict numbered section (4. 実験方法)
        start_pattern = re.compile(r"(?:^|\n)\s*4\.\s*実験方法", re.MULTILINE)
        # End at 5. (Results) or 6. (Discussion) or just "実験結果"
        end_pattern = re.compile(r"(?:^|\n)\s*(?:5\.|6\.|実験結果|考察)", re.MULTILINE)
        
        start_match = start_pattern.search(text)
        if not start_match:
            # Fallback: Look for just "実験方法" without number 4
            start_pattern_loose = re.compile(r"(?:^|\n)\s*(?:\d+\.\s*)?実験方法", re.MULTILINE)
            start_match = start_pattern_loose.search(text)
            
        if not start_match:
            # Fallback: Take 20-60% of text as per spec suggestion for failure
            total_len = len(text)
            return text[int(total_len * 0.2):int(total_len * 0.6)]
        
        start_idx = start_match.start()
        
        # Search for end pattern AFTER the start
        end_match = end_pattern.search(text, start_idx + len(start_match.group()))
        
        if end_match:
            return text[start_idx:end_match.start()]
        else:
            return text[start_idx:]

    def _extract_discussion_section(self, text: str) -> str:
        # v2 Spec: r'^6\.\s*考察' to r'^7\.' or 参考文献
        
        # Pattern 1: Strict numbered section (6. 考察)
        start_pattern = re.compile(r"(?:^|\n)\s*6\.\s*考察", re.MULTILINE)
        # End at 7. or 参考文献
        end_pattern = re.compile(r"(?:^|\n)\s*(?:7\.|参考文献|謝辞|付録)", re.MULTILINE)
        
        start_match = start_pattern.search(text)
        if not start_match:
            # Fallback: Look for just "考察" or "Discussion"
            start_pattern_loose = re.compile(r"(?:^|\n)\s*(?:\d+\.\s*)?(?:考察|検討|Discussion)", re.MULTILINE)
            start_match = start_pattern_loose.search(text)
            
        if not start_match:
             # Fallback: Take the last 30% of the text
            total_len = len(text)
            return text[int(total_len * 0.7):]
            
        start_idx = start_match.start()
        
        end_match = end_pattern.search(text, start_idx + len(start_match.group()))
        
        if end_match:
            return text[start_idx:end_match.start()]
        else:
            return text[start_idx:]
