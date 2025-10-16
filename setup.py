from setuptools import setup, find_packages

setup(
    name="fs22-discord-bot",
    version="1.0.0",
    description="Discord bot for Farming Simulator 22 server monitoring",
    packages=find_packages(),
    install_requires=[
        "discord.py>=2.3.0",
        "aiohttp>=3.8.0",
        "Flask>=2.0.0",
    ],
    python_requires=">=3.8",
)
