#!/usr/bin/env python
import os
from setuptools import setup, find_packages


def auto_version_setup(**kwargs):
    pkg_name = kwargs["packages"][0]

    # Populate the "version" argument from the "VERSION" file.
    pkg_path = os.path.join(os.path.dirname(__file__), pkg_name)
    with open(os.path.join(pkg_path, "VERSION"), "r") as handle:
        pkg_version = handle.read().strip()
    kwargs["version"] = pkg_version

    # Make sure the "VERSION" file is included when we build the package.
    package_data = kwargs.setdefault("package_data", {})
    this_pkg_data = package_data.setdefault(pkg_name, [])
    if "VERSION" not in this_pkg_data:
        this_pkg_data.append("VERSION")

    setup(**kwargs)


auto_version_setup(
    name='ruruki-eye',
    author='Andre F. Macedo',
    author_email='andre.macedo _at_ optiver.com.au',
    maintainer='Andre F. Macedo',
    maintainer_email='andre.macedo _at_ optiver.com.au',
    classifiers=[
        "Development Status :: 4 - Beta",
        "License :: OSI Approved :: Apache Software License",
        "Intended Audience :: Developers",
        "Intended Audience :: Information Technology",
        "Framework :: Flask",
        "Programming Language :: Python :: 2.7",
        "Programming Language :: Python :: 2 :: Only",
        "Topic :: Database :: Database Engines/Servers",
        "Topic :: Software Development :: Libraries",
    ],
    keywords='graph db memory interactive eye visualizer web',
    description='Ruruki Eye is a visualizer for Ruruki (In Memory Graph Tool)',
    packages=find_packages(),
    package_data={
        'ruruki_eye': [
            'static/*/*',
            'static/*.html',
        ]
    },
    install_requires=[
        'ruruki',
        'flask>=0.10.1,<0.11',
        'flask-cors>=2.1.2,<3.0.0'
    ],
)
